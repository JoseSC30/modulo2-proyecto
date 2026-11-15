import * as fs from "node:fs";
import * as path from "node:path";
import * as pulumi from "@pulumi/pulumi";
import * as azureNative from "@pulumi/azure-native";
import * as random from "@pulumi/random";

const config = new pulumi.Config();
const azureConfig = new pulumi.Config("azure-native");
const projectName = config.get("projectName") ?? "pulumi-control-asistencia-azure";
const configuredResourceGroupName = config.get("resourceGroupName") ?? `${projectName}-rg`;
const location = config.get("location") ?? azureConfig.get("location") ?? "eastus2";
const subscriptionId = azureConfig.require("subscriptionId");
const instanceType = config.get("instanceType") ?? "Standard_D2ads_v7";
const databaseVolumeSize = config.getNumber("databaseVolumeSize") ?? 10;
const adminUsername = config.get("adminUsername") ?? "azureuser";
const adminSshPublicKey = config.require("adminSshPublicKey");
const databaseImageId = config.require("databaseImageId");
const backendImageId = config.require("backendImageId");
const frontendImageId = config.require("frontendImageId");
const repositoryBranch = config.get("repositoryBranch") ?? "main";
const applicationUser = config.get("applicationUser") ?? "app";
const databaseName = config.get("databaseName") ?? "appdb";
const databaseUser = config.get("databaseUser") ?? "appuser";
const backendRepository = config.get("backendRepository")
    ?? "https://github.com/JoseSC30/backend-control-asistencia.git";
const frontendRepository = config.get("frontendRepository")
    ?? "https://github.com/JoseSC30/frontend-control-asistencia.git";

const azureProvider = new azureNative.Provider(`${projectName}-provider`, { subscriptionId });
const resourceGroup = new azureNative.resources.ResourceGroup(configuredResourceGroupName, {
    location,
    tags: { Project: projectName, Managed: "panel-tenant" },
}, { provider: azureProvider });

const provider = azureProvider;
const vnet = new azureNative.network.VirtualNetwork(`${projectName}-vnet`, {
    resourceGroupName: resourceGroup.name,
    location,
    addressSpace: { addressPrefixes: ["10.0.0.0/16"] },
}, { provider });

const subnet = new azureNative.network.Subnet(`${projectName}-subnet`, {
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: vnet.name,
    addressPrefix: "10.0.1.0/24",
}, { provider });

function createSecurityGroup(name: string, rules: azureNative.types.input.network.SecurityRuleArgs[]) {
    return new azureNative.network.NetworkSecurityGroup(name, {
        resourceGroupName: resourceGroup.name,
        location,
        securityRules: rules,
    }, { provider });
}

const sshRule = (name: string): azureNative.types.input.network.SecurityRuleArgs => ({
    name,
    priority: 100,
    access: "Allow",
    direction: "Inbound",
    protocol: "Tcp",
    sourceAddressPrefix: "*",
    sourcePortRange: "*",
    destinationAddressPrefix: "*",
    destinationPortRange: "22",
});

const databaseSg = createSecurityGroup(`${projectName}-database-nsg`, [
    sshRule("ssh"),
    {
        name: "postgres-from-vnet",
        priority: 110,
        access: "Allow",
        direction: "Inbound",
        protocol: "Tcp",
        sourceAddressPrefix: "VirtualNetwork",
        sourcePortRange: "*",
        destinationAddressPrefix: "*",
        destinationPortRange: "5432",
    },
]);

const backendSg = createSecurityGroup(`${projectName}-backend-nsg`, [
    sshRule("ssh"),
    {
        name: "http",
        priority: 110,
        access: "Allow",
        direction: "Inbound",
        protocol: "Tcp",
        sourceAddressPrefix: "*",
        sourcePortRange: "*",
        destinationAddressPrefix: "*",
        destinationPortRange: "80",
    },
    {
        name: "api-from-vnet",
        priority: 120,
        access: "Allow",
        direction: "Inbound",
        protocol: "Tcp",
        sourceAddressPrefix: "VirtualNetwork",
        sourcePortRange: "*",
        destinationAddressPrefix: "*",
        destinationPortRange: "3000",
    },
]);

const frontendSg = createSecurityGroup(`${projectName}-frontend-nsg`, [
    sshRule("ssh"),
    {
        name: "http",
        priority: 110,
        access: "Allow",
        direction: "Inbound",
        protocol: "Tcp",
        sourceAddressPrefix: "*",
        sourcePortRange: "*",
        destinationAddressPrefix: "*",
        destinationPortRange: "80",
    },
]);

function createPublicIp(name: string) {
    return new azureNative.network.PublicIPAddress(name, {
        resourceGroupName: resourceGroup.name,
        location,
        publicIPAllocationMethod: "Static",
        sku: { name: "Standard" },
    }, { provider });
}

function createNic(
    name: string,
    publicIp: azureNative.network.PublicIPAddress,
    securityGroup: azureNative.network.NetworkSecurityGroup,
) {
    return new azureNative.network.NetworkInterface(name, {
        resourceGroupName: resourceGroup.name,
        location,
        networkSecurityGroup: { id: securityGroup.id },
        ipConfigurations: [{
            name: "internal",
            subnet: { id: subnet.id },
            privateIPAllocationMethod: "Dynamic",
            publicIPAddress: { id: publicIp.id },
        }],
    }, { provider });
}

const databasePublicIp = createPublicIp(`${projectName}-database-ip`);
const backendPublicIp = createPublicIp(`${projectName}-backend-ip`);
const frontendPublicIp = createPublicIp(`${projectName}-frontend-ip`);
const databaseNic = createNic(`${projectName}-database-nic`, databasePublicIp, databaseSg);
const backendNic = createNic(`${projectName}-backend-nic`, backendPublicIp, backendSg);
const frontendNic = createNic(`${projectName}-frontend-nic`, frontendPublicIp, frontendSg);

function renderCloudInit(fileName: string, values: Record<string, pulumi.Input<string>>): pulumi.Output<string> {
    const template = fs.readFileSync(path.join(__dirname, "..", "..", "terraform", "azure", "cloud-init", fileName), "utf8");
    const keys = Object.keys(values);
    return pulumi.all(keys.map((key) => values[key])).apply((resolved) => {
        let content = template;
        keys.forEach((key, index) => {
            content = content.split(`\${${key}}`).join(String(resolved[index]));
        });
        return content;
    });
}

const databasePassword = new random.RandomPassword(`${projectName}-database-password`, {
    length: 32,
    special: false,
});
const jwtSecret = new random.RandomPassword(`${projectName}-jwt-secret`, {
    length: 64,
    special: false,
});
const databasePrivateIp = databaseNic.ipConfigurations.apply((configs) => configs?.[0]?.privateIPAddress ?? "");
const backendPrivateIp = backendNic.ipConfigurations.apply((configs) => configs?.[0]?.privateIPAddress ?? "");

const databaseDataDisk = new azureNative.compute.Disk(`${projectName}-database-data`, {
    resourceGroupName: resourceGroup.name,
    location,
    diskSizeGB: databaseVolumeSize,
    creationData: { createOption: "Empty" },
    sku: { name: "Standard_LRS" },
}, { provider });

function linuxVm(
    name: string,
    nic: azureNative.network.NetworkInterface,
    imageId: string,
    customData: pulumi.Input<string>,
    dataDisks: azureNative.types.input.compute.DataDiskArgs[] = [],
) {
    return new azureNative.compute.VirtualMachine(name, {
        resourceGroupName: resourceGroup.name,
        location,
        hardwareProfile: { vmSize: instanceType },
        networkProfile: { networkInterfaces: [{ id: nic.id, primary: true }] },
        storageProfile: {
            imageReference: { id: imageId },
            osDisk: {
                name: `${name}-os`,
                createOption: "FromImage",
                diskSizeGB: 30,
                managedDisk: { storageAccountType: "Standard_LRS" },
            },
            diskControllerType: "NVMe",
            dataDisks,
        },
        osProfile: {
            computerName: name.slice(0, 15),
            adminUsername,
            customData: pulumi.secret(customData).apply((value) => Buffer.from(value).toString("base64")),
            linuxConfiguration: {
                disablePasswordAuthentication: true,
                ssh: {
                    publicKeys: [{
                        path: `/home/${adminUsername}/.ssh/authorized_keys`,
                        keyData: adminSshPublicKey,
                    }],
                },
            },
        },
        tags: { Project: projectName },
    }, { provider });
}

const database = linuxVm(`${projectName}-database`, databaseNic, databaseImageId, renderCloudInit("database.yaml", {
    application_user: applicationUser,
    database_name: databaseName,
    database_user: databaseUser,
    database_password: databasePassword.result,
    vpc_cidr: "10.0.0.0/16",
    backend_repository: backendRepository,
    repository_branch: repositoryBranch,
    database_data_disk: "/dev/disk/azure/data/by-lun/0",
}), [{
    lun: 0,
    createOption: "Attach",
    caching: "ReadWrite",
    managedDisk: { id: databaseDataDisk.id },
}]);

const backend = linuxVm(`${projectName}-backend`, backendNic, backendImageId, renderCloudInit("backend.yaml", {
    application_user: applicationUser,
    backend_repository: backendRepository,
    repository_branch: repositoryBranch,
    database_private_ip: databasePrivateIp,
    database_name: databaseName,
    database_user: databaseUser,
    database_password: databasePassword.result,
    jwt_secret: jwtSecret.result,
}));

const frontend = linuxVm(`${projectName}-frontend`, frontendNic, frontendImageId, renderCloudInit("frontend.yaml", {
    application_user: applicationUser,
    backend_private_ip: backendPrivateIp,
    repository_url: frontendRepository,
    repository_branch: repositoryBranch,
}));

export const azureSubscriptionId = subscriptionId;
export const resourceGroupName = resourceGroup.name;
export const databasePublicIpAddress = databasePublicIp.ipAddress;
export const databasePrivateIpAddress = databasePrivateIp;
export const backendPublicIpAddress = backendPublicIp.ipAddress;
export const backendPrivateIpAddress = backendPrivateIp;
export const frontendPublicIpAddress = frontendPublicIp.ipAddress;
export const frontendUrl = pulumi.interpolate`http://${frontendPublicIp.ipAddress}`;
export const backendUrl = pulumi.interpolate`http://${backendPublicIp.ipAddress}`;
