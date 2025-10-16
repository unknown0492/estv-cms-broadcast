const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILE = 'config.inc';
const CONFIG_PATH = path.join(__dirname, CONFIG_FILE);

// Default values if not specified in config or API
const DEFAULT_BROADCAST_PORT = 8888;
const DEFAULT_BROADCAST_INTERVAL = 5000; // 5 seconds

class ConfigManager {
    constructor() {
        this.config = null;
    }

    // Parse broadcast IPs from CSV format string
    parseBroadcastIPs(broadcastIPString) {
        if (!broadcastIPString) return [];
        
        // Split by comma and trim whitespace
        const ips = broadcastIPString.split(',').map(ip => ip.trim()).filter(ip => ip.length > 0);
        
        // Validate IP format (basic validation)
        const validIPs = ips.filter(ip => {
            const parts = ip.split('.');
            if (parts.length !== 4) return false;
            return parts.every(part => {
                const num = parseInt(part);
                return !isNaN(num) && num >= 0 && num <= 255;
            });
        });
        
        if (validIPs.length !== ips.length) {
            console.log('⚠ Some broadcast IPs were invalid and filtered out');
            console.log('  Valid IPs:', validIPs);
        }
        
        return validIPs;
    }

    // Load configuration from file
    loadConfig() {
        console.log('Loading configuration...\n');
        
        // Check if config file exists
        if (!fs.existsSync(CONFIG_PATH)) {
            console.error(`✗ Configuration file '${CONFIG_FILE}' not found!`);
            console.error(`  Please create a '${CONFIG_FILE}' file in the same directory with at least:`);
            console.error(`  {`);
            console.error(`    "propertyId": "your_property_id",`);
            console.error(`    "app_id": "your_app_id",`);
            console.error(`    "app_secret": "your_app_secret"`);
            console.error(`  }`);
            process.exit(1);
        }

        try {
            // Read and parse config file
            const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
            this.config = JSON.parse(configData);
            
            // Check if required fields exist
            if (!this.config.propertyId) {
                console.error(`✗ 'propertyId' is missing in ${CONFIG_FILE}!`);
                console.error(`  This field is mandatory.`);
                process.exit(1);
            }

            if (!this.config.app_id || !this.config.app_secret) {
                console.error(`✗ 'app_id' and 'app_secret' are missing in ${CONFIG_FILE}!`);
                console.error(`  These fields are mandatory for API authentication.`);
                process.exit(1);
            }

            console.log(`✓ Configuration loaded from ${CONFIG_FILE}`);
            console.log(`  Property ID: ${this.config.propertyId}`);
            console.log(`  App ID: ${this.config.app_id}`);
            
            // Parse broadcast IPs if present
            if (this.config.broadcastIP) {
                const parsedIPs = this.parseBroadcastIPs(this.config.broadcastIP);
                if (parsedIPs.length > 0) {
                    this.config.broadcastIPs = parsedIPs;
                    console.log(`  Broadcast IPs: ${parsedIPs.join(', ')}`);
                }
            }
            
            return this.config;
            
        } catch (error) {
            if (error instanceof SyntaxError) {
                console.error(`✗ Invalid JSON in ${CONFIG_FILE}:`);
                console.error(`  ${error.message}`);
            } else {
                console.error(`✗ Error reading ${CONFIG_FILE}:`);
                console.error(`  ${error.message}`);
            }
            process.exit(1);
        }
    }

    // Save configuration to file
    saveConfig() {
        try {
            // Convert broadcastIPs array back to CSV string for saving
            const configToSave = { ...this.config };
            
            //console.log('🔍 DEBUG: Original config to save:', JSON.stringify(configToSave, null, 2));
            
            if (configToSave.broadcastIPs && Array.isArray(configToSave.broadcastIPs)) {
                configToSave.broadcastIP = configToSave.broadcastIPs.join(', ');
                delete configToSave.broadcastIPs; // Remove the array version
            }
            
            //console.log('🔍 DEBUG: Final config to save:', JSON.stringify(configToSave, null, 2));
            
            const configJson = JSON.stringify(configToSave, null, 2);
            fs.writeFileSync(CONFIG_PATH, configJson, 'utf8');
            //console.log(`✓ Configuration saved to ${CONFIG_FILE}`);
            
            // Verify the file was written
            const savedData = fs.readFileSync(CONFIG_PATH, 'utf8');
            //console.log('🔍 DEBUG: Saved file content:', savedData);
            
        } catch (error) {
            console.error(`✗ Error saving configuration: ${error.message}`);
            console.error('Stack trace:', error.stack);
        }
    }

    // Get local IP address as fallback
    getLocalIP() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    if (iface.address.startsWith('192.168.1.')) {
                        return iface.address;
                    }
                }
            }
        }
        // Return first non-internal IPv4 if no 192.168.1.x found
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return '127.0.0.1';
    }

    // Use fallback values when API fails
    useFallbackValues() {
        console.log('\n  Note: Using hardcoded fallback values...');
        
        // Use hardcoded fallback values
        if (!this.config.broadcastIPs || this.config.broadcastIPs.length === 0) {
            const localIP = this.getLocalIP();
            // Calculate subnet broadcast based on local IP
            const ipParts = localIP.split('.');
            if (ipParts.length === 4) {
                ipParts[3] = '255';
                this.config.broadcastIPs = [ipParts.join('.'), '255.255.255.255'];
            } else {
                this.config.broadcastIPs = ['255.255.255.255'];
            }
        }
        this.config.onPremiseServerIP = this.config.onPremiseServerIP || this.getLocalIP();
        this.config.broadcastPort = this.config.broadcastPort || DEFAULT_BROADCAST_PORT;
        this.config.broadcastInterval = this.config.broadcastInterval || DEFAULT_BROADCAST_INTERVAL;
        
        this.saveConfig();
        return this.config;
    }

    // Validate and complete configuration
    async validateAndComplete(apiClient) {
        const missingFields = [];
        
        if (!this.config.broadcastIPs || this.config.broadcastIPs.length === 0) {
            if (!this.config.broadcastIP) {
                missingFields.push('broadcastIP');
            } else {
                this.config.broadcastIPs = this.parseBroadcastIPs(this.config.broadcastIP);
            }
        }
        if (!this.config.onPremiseServerIP) missingFields.push('onPremiseServerIP');
        if (!this.config.broadcastPort) missingFields.push('broadcastPort');
        if (!this.config.broadcastInterval) missingFields.push('broadcastInterval');
        
        // If all fields are present, ask user if they want to resync
        if (missingFields.length === 0) {
            console.log('✓ All configuration fields present');
            
            const shouldResync = await this.promptForResync();
            if (shouldResync) {
                console.log('\n⚡ Performing configuration resync from API...');
                const configData = await apiClient.fetchConfiguration(this.config.propertyId);
                
                if (configData) {
                    let configUpdated = false;
                    
                    // Update config with API response - mapping API field names to local field names
                    if (configData.broadcast_ip && configData.broadcast_ip !== this.config.broadcastIP) {
                        const newBroadcastIPs = this.parseBroadcastIPs(configData.broadcast_ip);
                        this.config.broadcastIPs = newBroadcastIPs;
                        this.config.broadcastIP = configData.broadcast_ip; // Store original format too
                        console.log(`  Broadcast IPs updated: ${newBroadcastIPs.join(', ')}`);
                        configUpdated = true;
                    }
                    if (configData.on_premise_server_ip && configData.on_premise_server_ip !== this.config.onPremiseServerIP) {
                        this.config.onPremiseServerIP = configData.on_premise_server_ip;
                        console.log(`  On-Premise Server IP updated: ${configData.on_premise_server_ip}`);
                        configUpdated = true;
                    }
                    if (configData.broadcast_port && parseInt(configData.broadcast_port) !== this.config.broadcastPort) {
                        this.config.broadcastPort = parseInt(configData.broadcast_port);
                        console.log(`  Broadcast Port updated: ${configData.broadcast_port}`);
                        configUpdated = true;
                    }
                    if (configData.broadcast_interval && parseInt(configData.broadcast_interval) !== this.config.broadcastInterval) {
                        this.config.broadcastInterval = parseInt(configData.broadcast_interval);
                        console.log(`  Broadcast Interval updated: ${configData.broadcast_interval}ms`);
                        configUpdated = true;
                    }
                    
                    if (configUpdated) {
                        // Save updated config to file
                        this.saveConfig();
                        console.log('✓ Configuration resynced and saved successfully');
                    } else {
                        console.log('ℹ No configuration changes detected from API');
                    }
                } else {
                    console.log('⚠ Resync failed, using existing configuration');
                }
            } else {
                console.log('ℹ Skipping resync, using existing configuration');
            }
        } else {
            console.log(`\n⚠ Missing configuration fields: ${missingFields.join(', ')}`);
            const configData = await apiClient.fetchConfiguration(this.config.propertyId);
            
            if (configData) {
                // Update config with API response - using correct field mappings
                if (configData.broadcast_ip) {
                    this.config.broadcastIPs = this.parseBroadcastIPs(configData.broadcast_ip);
                    console.log(`  Broadcast IPs: ${this.config.broadcastIPs.join(', ')}`);
                }
                if (configData.on_premise_server_ip) {
                    this.config.onPremiseServerIP = configData.on_premise_server_ip;
                    console.log(`  On-Premise Server IP: ${configData.on_premise_server_ip}`);
                }
                if (configData.broadcast_port) {
                    this.config.broadcastPort = parseInt(configData.broadcast_port);
                    console.log(`  Broadcast Port: ${configData.broadcast_port}`);
                }
                if (configData.broadcast_interval) {
                    this.config.broadcastInterval = parseInt(configData.broadcast_interval);
                    console.log(`  Broadcast Interval: ${configData.broadcast_interval}ms`);
                }
                
                // Save updated config to file
                this.saveConfig();
            } else {
                this.useFallbackValues();
            }
        }
        
        // Final validation
        if (!this.config.broadcastIPs || this.config.broadcastIPs.length === 0 ||
            !this.config.onPremiseServerIP || !this.config.broadcastPort || 
            !this.config.propertyId) {
            console.error('\n✗ Configuration incomplete after API fetch!');
            console.error('  Current config:', this.config);
            process.exit(1);
        }
        
        return this.config;
    }

    // Prompt user for resync with 15-second timeout
    promptForResync() {
        return new Promise((resolve) => {
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            console.log('\n╔═══════════════════════════════════════════╗');
            console.log('║        Configuration Resync Option        ║');
            console.log('╚═══════════════════════════════════════════╝');
            console.log('Do you want to resync configuration from API? (y/N): ');
            console.log('(Auto-skip in 15 seconds if no response)\n');

            let answered = false;
            
            // Set 15-second timeout
            const timeout = setTimeout(() => {
                if (!answered) {
                    answered = true;
                    console.log('\n⏱ Timeout reached, skipping resync...\n');
                    rl.close();
                    resolve(false);
                }
            }, 15000);

            rl.question('', (answer) => {
                if (!answered) {
                    answered = true;
                    clearTimeout(timeout);
                    rl.close();
                    
                    const response = answer.toLowerCase().trim();
                    resolve(response === 'y' || response === 'yes');
                }
            });
        });
    }
}

module.exports = ConfigManager;