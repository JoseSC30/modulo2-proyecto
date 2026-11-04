import * as fs from "node:fs";
import * as path from "node:path";
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as random from "@pulumi/random";

const config = new pulumi.Config();
const awsConfig = new pulumi.Config("aws");

const projectName = config.get("projectName") ?? "pulumi-control-asistencia-2026";
const availabilityZone = config.get("availabilityZone") ?? "us-east-2a";
const instanceType = config.get("instanceType") ?? "t2.micro";
const repositoryBranch = config.get("repositoryBranch") ?? "main";
const applicationUser = config.get("applicationUser") ?? "app";
const databaseName = config.get("databaseName") ?? "appdb";
const databaseUser = config.get("databaseUser") ?? "appuser";
const backendRepository = config.get("backendRepository")
    ?? "https://github.com/JoseSC30/backend-control-asistencia.git";
const frontendRepository = config.get("frontendRepository")
    ?? "https://github.com/JoseSC30/frontend-control-asistencia.git";
const region = awsConfig.get("region") ?? "us-east-2";

const defaultVpc = aws.ec2.getVpcOutput({ default: true });

const backendDbSg = new aws.ec2.SecurityGroup(`${projectName}-backend-db-sg`, {
    name: `${projectName}-backend-db-sg`,
    description: "Backend, PostgreSQL y acceso administrativo por EC2 Instance Connect",
    vpcId: defaultVpc.id,
    ingress: [
        { description: "SSH mediante EC2 Instance Connect", fromPort: 22, toPort: 22, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] },
        { description: "HTTP", fromPort: 80, toPort: 80, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] },
    ],
    egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }],
    tags: { Name: `${projectName}-backend-db-sg`, Project: projectName },
});

const frontendSg = new aws.ec2.SecurityGroup(`${projectName}-frontend-sg`, {
    name: `${projectName}-frontend-sg`,
    description: "Frontend y acceso administrativo por EC2 Instance Connect",
    vpcId: defaultVpc.id,
    ingress: [
        { description: "SSH mediante EC2 Instance Connect", fromPort: 22, toPort: 22, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] },
        { description: "HTTP", fromPort: 80, toPort: 80, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] },
    ],
    egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }],
    tags: { Name: `${projectName}-frontend-sg`, Project: projectName },
});

const backendDbIngress = new aws.ec2.SecurityGroupRule(`${projectName}-backend-api-from-frontend`, {
    type: "ingress",
    securityGroupId: backendDbSg.id,
    fromPort: 3000,
    toPort: 3000,
    protocol: "tcp",
    sourceSecurityGroupId: frontendSg.id,
    description: "API desde frontend",
});

const postgresIngress = new aws.ec2.SecurityGroupRule(`${projectName}-postgres-from-frontend`, {
    type: "ingress",
    securityGroupId: backendDbSg.id,
    fromPort: 5432,
    toPort: 5432,
    protocol: "tcp",
    sourceSecurityGroupId: frontendSg.id,
    description: "PostgreSQL desde frontend",
});

const ubuntuAmi = aws.ec2.getAmiOutput({
    mostRecent: true,
    filters: [
        { name: "name", values: ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"] },
        { name: "virtualization-type", values: ["hvm"] },
    ],
    owners: ["099720109477"],
});

const databasePassword = new random.RandomPassword(`${projectName}-database-password`, {
    length: 32,
    special: false,
});

const jwtSecret = new random.RandomPassword(`${projectName}-jwt-secret`, {
    length: 64,
    special: false,
});

function renderCloudInit(
    fileName: string,
    values: Record<string, pulumi.Input<string>>,
): pulumi.Output<string> {
    const template = fs.readFileSync(path.join(__dirname, "cloud-init", fileName), "utf8");
    const keys = Object.keys(values);
    return pulumi.all(keys.map((key) => values[key])).apply((resolved) => {
        let content = template;
        keys.forEach((key, index) => {
            content = content.split(`\${${key}}`).join(String(resolved[index]));
        });
        return content;
    });
}

const backendUserData = renderCloudInit("backend-db.yaml", {
    application_user: applicationUser,
    database_name: databaseName,
    database_user: databaseUser,
    database_password: databasePassword.result,
    jwt_secret: jwtSecret.result,
    vpc_cidr: defaultVpc.cidrBlock,
    repository_url: backendRepository,
    repository_branch: repositoryBranch,
});

const backendDb = new aws.ec2.Instance(`${projectName}-backend-db`, {
    ami: ubuntuAmi.id,
    instanceType,
    availabilityZone,
    vpcSecurityGroupIds: [backendDbSg.id],
    userData: backendUserData,
    userDataReplaceOnChange: true,
    tags: { Name: `${projectName}-backend-db`, Project: projectName, Role: "backend-db" },
}, { dependsOn: [backendDbIngress, postgresIngress] });

const frontendUserData = renderCloudInit("frontend.yaml", {
    application_user: applicationUser,
    backend_private_ip: backendDb.privateIp,
    repository_url: frontendRepository,
    repository_branch: repositoryBranch,
});

const frontend = new aws.ec2.Instance(`${projectName}-frontend`, {
    ami: ubuntuAmi.id,
    instanceType,
    availabilityZone,
    vpcSecurityGroupIds: [frontendSg.id],
    userData: frontendUserData,
    userDataReplaceOnChange: true,
    tags: { Name: `${projectName}-frontend`, Project: projectName, Role: "frontend" },
});

export const pulumiProject = projectName;
export const awsRegion = region;
export const backendDbPublicIp = backendDb.publicIp;
export const backendDbPrivateIp = backendDb.privateIp;
export const frontendPublicIp = frontend.publicIp;
export const frontendUrl = pulumi.interpolate`http://${frontend.publicIp}`;
export const backendUrl = pulumi.interpolate`http://${backendDb.publicIp}`;
