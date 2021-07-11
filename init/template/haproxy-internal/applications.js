module.exports.applications = [
    {
        containerName: "registry_npm",
        containerPort: 4873,
        hostName: ["npm.example.internal"]
    },
    {
        containerName: "monitoring_grafana",
        containerPort: 3000,
        hostName: ["grafana.example.internal"]
    },
    {
        containerName: "registry_docker",
        containerPort: 5000,
        hostName: ["docker.example.internal"]
    }
]
