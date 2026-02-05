const dgram = require('dgram');
const os = require('os');

class UDPBroadcastServer {
    constructor(config) {
        this.config = config;
        this.server = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        this.selectedInterface = null;
        this.broadcastInterval = null;
        this.serverInfo = {
            name: 'MyUDPServer',
            version: '1.0.1',
            timestamp: null,
            hostname: os.hostname(),
            port: this.config.broadcastPort,
            services: ['data-stream', 'discovery'],
            customData: 'Hello from UDP Server!',
            estvData: {
                'on_premise_server_url': this.config.onPremiseServerIP,
                'cms_server_url': this.config.cmsServer, // Fixed: should use cmsServer, not onPremiseServerIP
                'default_device_type': this.config.defaultDeviceType,
                'property_id': this.config.propertyId
            }
        };
    }

    // Get network interface details
    getNetworkInterface() {
        const interfaces = os.networkInterfaces();
        
        // First try to find exact match
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && 
                    !iface.internal && 
                    iface.address === this.config.onPremiseServerIP) {
                    
                    return {
                        name: name,
                        ip: iface.address,
                        netmask: iface.netmask,
                        mac: iface.mac
                    };
                }
            }
        }
        
        // If exact match not found, try to extract IP from URL format
        let targetIP = this.config.onPremiseServerIP;
        if (targetIP.includes('://')) {
            // Extract IP from URL format like "http://192.168.1.2/estv.gen3.ops"
            const urlMatch = targetIP.match(/https?:\/\/([^\/]+)/);
            if (urlMatch) {
                targetIP = urlMatch[1];
                console.log(`📝 Extracted IP ${targetIP} from URL ${this.config.onPremiseServerIP}`);
            }
        }
        
        // Try again with extracted IP
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && 
                    !iface.internal && 
                    iface.address === targetIP) {
                    
                    return {
                        name: name,
                        ip: iface.address,
                        netmask: iface.netmask,
                        mac: iface.mac
                    };
                }
            }
        }
        
        // If still not found, return the first available non-internal IPv4 interface
        console.log(`⚠️  Exact IP match not found for ${targetIP}, using first available interface`);
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    console.log(`🔄 Using interface ${name} with IP ${iface.address}`);
                    return {
                        name: name,
                        ip: iface.address,
                        netmask: iface.netmask,
                        mac: iface.mac
                    };
                }
            }
        }
        
        return null;
    }

    start() {
        console.log('\n═══════════════════════════════════════════');
        console.log('     Starting UDP Broadcast Server');
        console.log('═══════════════════════════════════════════\n');
        
        // Get network interface details
        this.selectedInterface = this.getNetworkInterface();
        
        if (!this.selectedInterface) {
            console.error(`✗ No suitable network interface found!`);
            console.error('  Available interfaces:');
            
            const interfaces = os.networkInterfaces();
            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name]) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        console.error(`    - ${name}: ${iface.address}`);
                    }
                }
            }
            process.exit(1);
        }

        console.log(`✓ Network Interface: ${this.selectedInterface.name}`);
        console.log(`  IP Address: ${this.selectedInterface.ip}`);
        console.log(`  MAC Address: ${this.selectedInterface.mac}`);

        // Set server info
        this.serverInfo.ip = this.selectedInterface.ip;
        this.serverInfo.interface = this.selectedInterface.name;

        // Bind to the specific interface IP
        this.server.bind(this.config.broadcastPort, this.selectedInterface.ip, () => {
            this.server.setBroadcast(true);
            
            console.log(`\n✓ Server Configuration:`);
            console.log(`  - Bound to: ${this.selectedInterface.ip}:${this.config.broadcastPort}`);
            console.log(`  - Broadcasting to ${this.config.broadcastIPs.length} address(es):`);
            this.config.broadcastIPs.forEach((ip, index) => {
                console.log(`    ${index + 1}. ${ip}:${this.config.broadcastPort}`);
            });
            console.log(`  - Interface: ${this.selectedInterface.name}`);
            console.log(`  - Interval: ${this.config.broadcastInterval}ms (${this.config.broadcastInterval/1000} seconds)`);
            console.log(`\n✓ ESTV Data Configuration:`);
            console.log(`  - On-Premise Server: ${this.serverInfo.estvData.on_premise_server_url}`);
            console.log(`  - CMS Server: ${this.serverInfo.estvData.cms_server_url}`);
            console.log(`  - Property ID: ${this.serverInfo.estvData.property_id}`);
            console.log(`\n✓ Server is running. Press Ctrl+C to stop.\n`);
            console.log('─────────────────────────────────────────────\n');
            
            // Start broadcasting
            this.startBroadcasting();
            
            // Listen for incoming messages
            this.setupMessageHandler();
        });

        // Handle errors
        this.server.on('error', (err) => {
            console.error('Server error:', err);
            
            if (err.code === 'EADDRINUSE') {
                console.log(`\n✗ Port ${this.config.broadcastPort} is already in use!`);
                console.log('  💡 Try changing the broadcastPort in your configuration or stop other services using this port.');
            } else if (err.code === 'EADDRNOTAVAIL') {
                console.log(`\n✗ Cannot bind to ${this.selectedInterface.ip}`);
                console.log('  💡 The network interface may have changed. Please check your network configuration.');
            } else if (err.code === 'EACCES') {
                console.log('\n✗ Permission denied. Try running as administrator.');
                console.log('  💡 Some ports require elevated privileges to bind.');
            } else {
                console.log(`\n✗ Unexpected error: ${err.message}`);
            }
            
            this.server.close();
            process.exit(1);
        });
    }

    setupMessageHandler() {
        this.server.on('message', (msg, rinfo) => {
            const message = msg.toString().trim();
            const timestamp = new Date().toLocaleTimeString();
            //console.log(`[${timestamp}] Received from ${rinfo.address}:${rinfo.port}: "${message}"`);
            
            // Respond to discovery requests
            if (message === 'DISCOVER' || message === 'PING') {
                this.sendDirectResponse(rinfo.address, rinfo.port, {
                    type: 'DISCOVERY_RESPONSE',
                    ...this.serverInfo,
                    responseTime: new Date().toISOString()
                });
            }
        });
    }

    startBroadcasting() {
        let counter = 0;
        
        const broadcast = () => {
            counter++;
            
            // Update dynamic data
            this.serverInfo.timestamp = new Date().toISOString();
            this.serverInfo.uptime = Math.round(process.uptime());
            this.serverInfo.counter = counter;
            this.serverInfo.randomValue = Math.floor(Math.random() * 1000);
            this.serverInfo.memoryUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB';
            
            // Add additional dynamic data
            this.serverInfo.data = {
                temperature: (20 + Math.random() * 10).toFixed(1) + '°C',
                humidity: Math.floor(40 + Math.random() * 30) + '%',
                status: counter % 10 === 0 ? 'maintenance' : 'operational',
                messagesProcessed: counter * 5
            };
            
            // Convert to JSON
            const message = JSON.stringify(this.serverInfo);
            const buffer = Buffer.from(message);

            const timestamp = new Date().toLocaleTimeString();
            let successCount = 0;
            let errorCount = 0;

            // Broadcast to all configured IPs
            this.config.broadcastIPs.forEach((broadcastIP, index) => {
                this.server.send(buffer, 0, buffer.length, this.config.broadcastPort, broadcastIP, (err) => {
                    if (err) {
                        errorCount++;
                        console.error(`  ✗ [${timestamp}] Broadcast error to ${broadcastIP}: ${err.message}`);
                    } else {
                        successCount++;
                        // Only log individual success if there are multiple broadcast IPs
                        if (this.config.broadcastIPs.length > 1) {
                            console.log(`  ✓ [${timestamp}] Sent to ${broadcastIP}:${this.config.broadcastPort}`);
                        }
                    }
                    
                    // Log summary after all broadcasts are attempted
                    if (successCount + errorCount === this.config.broadcastIPs.length) {
                        if (this.config.broadcastIPs.length === 1) {
                            // Single IP - simple log
                            console.log(`[${timestamp}] Broadcast #${counter} sent to ${this.config.broadcastIPs[0]}:${this.config.broadcastPort}`);
                        } else {
                            // Multiple IPs - summary log
                            console.log(`[${timestamp}] Broadcast #${counter} completed: ${successCount}/${this.config.broadcastIPs.length} successful`);
                        }
                        
                        // Commented out detailed JSON data output to reduce console clutter
                        // Original code showed full JSON content and buffer size
                        /*
                        // Log the ESTV data being broadcast periodically
                        if (counter === 1 || counter % 10 === 0) {
                            console.log(`  └─ ESTV Data: Property ${this.serverInfo.estvData.property_id} @ ${this.serverInfo.estvData.on_premise_server_url}`);
                            console.log(`  └─ Full JSON: ${message}`);
                            console.log(`  └─ Buffer size: ${buffer.length} bytes`);
                        }
                        */
                    }
                });
            });
        };

        // Initial broadcast
        broadcast();
        
        // Set up interval for periodic broadcasts
        this.broadcastInterval = setInterval(broadcast, this.config.broadcastInterval);
    }

    sendDirectResponse(address, port, data) {
        const response = JSON.stringify(data);
        const buffer = Buffer.from(response);
        
        this.server.send(buffer, 0, buffer.length, port, address, (err) => {
            if (err) {
                console.error(`✗ Failed to send response to ${address}:${port}: ${err.message}`);
            } else {
                const timestamp = new Date().toLocaleTimeString();
                console.log(`[${timestamp}] Direct response sent to ${address}:${port}`);
            }
        });
    }

    stop() {
        if (this.broadcastInterval) {
            clearInterval(this.broadcastInterval);
        }
        
        this.server.close(() => {
            console.log('\n✓ Server stopped gracefully');
        });
    }
}

module.exports = UDPBroadcastServer;