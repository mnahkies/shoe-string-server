#!/usr/bin/env node
const path = require("path");
const fs = require("fs");

/*

interface Application {
    containerName: string
    containerPort: number
    hostName: string | string[]
}

*/

function generateUseBackends(applications) {
    return applications.map(app => {
        const hostNames = Array.isArray(app.hostName) ? app.hostName : [app.hostName]

        return hostNames.map(hostName => {
            return `    use_backend ${app.containerName} if { hdr_beg(host) -i ${hostName} }`
        }).join('\n')
    }).join('\n\n')
}

function generateBackends(applications) {
    return applications.map(app => {
        return [
            `backend ${app.containerName}`,
            `    balance    roundrobin`,
            `    server     ${app.containerName} ${app.containerName}:${app.containerPort ?? 80} resolvers docker_resolver`
        ].join('\n')
    }).join('\n\n')
}

function main() {
    const directory = process.argv[2];
    console.info(`generating proxy configuration for directory ${directory}`)

    const {applications} = require(path.join(directory, 'applications.js'))
    const template = fs.readFileSync(path.join(directory, 'haproxy.cfg.template'), 'utf-8')

    const warning = `#---------------------------------------------------------------------
# WARNING: automatically generated, please edit the template file haproxy.cfg.template
#---------------------------------------------------------------------

`

    const output = warning + template
        .replace('{{USE_BACKENDS}}', generateUseBackends(applications))
        .replace('{{BACKENDS}}', generateBackends(applications))

    fs.writeFileSync(path.join(directory, 'haproxy.cfg'), output, {encoding: 'utf-8'})
}


main()
