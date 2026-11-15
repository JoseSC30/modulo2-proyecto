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
const databaseVolumeSize = config.getNumber("databaseVolumeSize") ?? 10;
const repositoryBranch = config.get("repositoryBranch") ?? "main";
const applicationUser = config.get("applicationUser") ?? "app";
const databaseName = config.get("databaseName") ?? "appdb";
const databaseUser = config.get("databaseUser") ?? "appuser";
const backendRepository = config.get("backendRepository")
    ?? "https://github.com/JoseSC30/backend-control-asistencia.git";
const frontendRepository = config.get("frontendRepository")
    ?? "https://github.com/JoseSC30/frontend-control-asistencia.git";
const databaseAmiId = config.get("databaseAmiId") ?? "ami-038688e44f645d38b";
const backendAmiId = config.get("backendAmiId") ?? "ami-0d2762890413d06f8";
const frontendAmiId = config.get("frontendAmiId") ?? "ami-06dc23ac77b6391f1";
const region = awsConfig.get("region") ?? "us-east-2";

const defaultVpc = aws.ec2.getVpcOutput({ default: true });

const frontendSg = new aws.ec2.SecurityGroup(`${projectName}-frontend-sg`, {
    name: `${projectName}-frontend-sg`,
    description: "Acceso HTTP para el frontend",
    vpcId: defaultVpc.id,
    ingress: [
        { description: "SSH mediante EC2 Instance Connect", fromPort: 22, toPort: 22, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] },
        { description: "HTTP", fromPort: 80, toPort: 80, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] },
        { description: "Node Exporter para Prometheus", fromPort: 9100, toPort: 9100, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] },
    ],
    egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }],
    tags: { Name: `${projectName}-frontend-sg`, Project: projectName },
});

const backendSg = new aws.ec2.SecurityGroup(`${projectName}-backend-sg`, {
    name: `${projectName}-backend-sg`,
    description: "HTTP y API del backend",
    vpcId: defaultVpc.id,
    ingress: [
        { description: "SSH mediante EC2 Instance Connect", fromPort: 22, toPort: 22, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] },
        { description: "Health endpoint del backend", fromPort: 80, toPort: 80, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] },
        { description: "API desde el frontend", fromPort: 3000, toPort: 3000, protocol: "tcp", securityGroups: [frontendSg.id] },
        { description: "Node Exporter para Prometheus", fromPort: 9100, toPort: 9100, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] },
    ],
    egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }],
    tags: { Name: `${projectName}-backend-sg`, Project: projectName },
});

const databaseSg = new aws.ec2.SecurityGroup(`${projectName}-database-sg`, {
    name: `${projectName}-database-sg`,
    description: "PostgreSQL privado para el backend",
    vpcId: defaultVpc.id,
    ingress: [
        { description: "SSH mediante EC2 Instance Connect", fromPort: 22, toPort: 22, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] },
        { description: "PostgreSQL desde el backend", fromPort: 5432, toPort: 5432, protocol: "tcp", securityGroups: [backendSg.id] },
        { description: "Node Exporter para Prometheus", fromPort: 9100, toPort: 9100, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] },
    ],
    egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }],
    tags: { Name: `${projectName}-database-sg`, Project: projectName },
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
    const template = fs.readFileSync(path.join(__dirname, "..", "..", "terraform", "aws", "cloud-init", fileName), "utf8");
    const keys = Object.keys(values);
    return pulumi.all(keys.map((key) => values[key])).apply((resolved) => {
        let content = template;
        keys.forEach((key, index) => {
            content = content.split(`\${${key}}`).join(String(resolved[index]));
        });
        return content;
    });
}

const databaseUserData = renderCloudInit("database.yaml", {
    application_user: applicationUser,
    database_name: databaseName,
    database_user: databaseUser,
    database_password: databasePassword.result,
    vpc_cidr: defaultVpc.cidrBlock,
    backend_repository: backendRepository,
    repository_branch: repositoryBranch,
});

const database = new aws.ec2.Instance(`${projectName}-database`, {
    ami: databaseAmiId,
    instanceType,
    availabilityZone,
    vpcSecurityGroupIds: [databaseSg.id],
    userData: databaseUserData,
    userDataReplaceOnChange: true,
    rootBlockDevice: {
        volumeSize: databaseVolumeSize,
        volumeType: "gp3",
        deleteOnTermination: true,
    },
    tags: { Name: `${projectName}-database`, Project: projectName, Role: "database" },
});

const backendUserData = renderCloudInit("backend.yaml", {
    application_user: applicationUser,
    backend_repository: backendRepository,
    repository_branch: repositoryBranch,
    database_private_ip: database.privateIp,
    database_name: databaseName,
    database_user: databaseUser,
    database_password: databasePassword.result,
    jwt_secret: jwtSecret.result,
});

const backend = new aws.ec2.Instance(`${projectName}-backend`, {
    ami: backendAmiId,
    instanceType,
    availabilityZone,
    vpcSecurityGroupIds: [backendSg.id],
    userData: backendUserData,
    userDataReplaceOnChange: true,
    tags: { Name: `${projectName}-backend`, Project: projectName, Role: "backend" },
});

const frontendUserData = renderCloudInit("frontend.yaml", {
    application_user: applicationUser,
    backend_private_ip: backend.privateIp,
    repository_url: frontendRepository,
    repository_branch: repositoryBranch,
});

const frontend = new aws.ec2.Instance(`${projectName}-frontend`, {
    ami: frontendAmiId,
    instanceType,
    availabilityZone,
    vpcSecurityGroupIds: [frontendSg.id],
    userData: frontendUserData,
    userDataReplaceOnChange: true,
    tags: { Name: `${projectName}-frontend`, Project: projectName, Role: "frontend" },
});

export const pulumiProject = projectName;
export const awsRegion = region;
export const databasePublicIp = database.publicIp;
export const databasePrivateIp = database.privateIp;
export const backendPublicIp = backend.publicIp;
export const backendPrivateIp = backend.privateIp;
export const frontendPublicIp = frontend.publicIp;
export const frontendUrl = pulumi.interpolate`http://${frontend.publicIp}`;
export const backendUrl = pulumi.interpolate`http://${backend.publicIp}`;
