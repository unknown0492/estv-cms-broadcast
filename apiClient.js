// Import the hardcoded configuration
const fs = require('fs');
const path = require('path');

// Load config from JSON file
const configPath = path.join(__dirname, 'config.inc');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

class ApiClient {
  constructor() {
    // Hardcoded parameters from config.inc
    this.propertyId = config.propertyId;
    this.app_id = config.app_id;
    this.app_secret = config.app_secret;
    this.cmsServer = config.cmsServer;
    
    // Build the CLOUD_API_URL
    this.CLOUD_API_URL = this.cmsServer + "/webservice.php";
    
    // Dynamic parameters (to be fetched from API)
    this.onPremiseServer = null;
    this.broadcastPort = null;
    this.broadcastInterval = null;
    this.broadcastIP = null;
    
    this.isInitialized = false;
  }

  /**
   * Authenticate with the API to get new access tokens
   */
  async authenticateWithAPI() {
    try {
      console.log('🔐 Calling authentication API to get new access token...');
      
      const authParams = new URLSearchParams();
      authParams.append('what_do_you_want', 'scodezy_authenticate_app');
      authParams.append('app_id', this.app_id);
      authParams.append('app_secret', this.app_secret);

      console.log('📤 Sending authentication request to:', this.CLOUD_API_URL);
      console.log('📤 Auth payload (as POST form data):');
      console.log('   what_do_you_want: scodezy_authenticate_app');
      console.log('   app_id:', this.app_id);
      console.log('   app_secret: [HIDDEN]');

      const response = await fetch(this.CLOUD_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: authParams.toString()
      });

      console.log('📥 Auth response status:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`Authentication HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();
      console.log('🔍 Raw Auth Response:', JSON.stringify(responseData, null, 2));

      // Handle array response format
      if (!Array.isArray(responseData) || responseData.length === 0) {
        throw new Error('Invalid authentication response format: expected array with data');
      }

      const authResponse = responseData[0];

      // Check if authentication was successful
      if (authResponse.type !== 'success') {
        let errorMessage = `Authentication failed: ${authResponse.type}`;
        
        if (authResponse.message) {
          errorMessage += ` - ${authResponse.message}`;
        }
        
        if (authResponse.info) {
          errorMessage += ` - Info: ${JSON.stringify(authResponse.info)}`;
        }

        console.error('❌ Full Auth Error Response:', JSON.stringify(authResponse, null, 2));
        throw new Error(errorMessage);
      }

      // Verify this is the expected authentication response
      if (authResponse.for !== 'scodezy_authenticate_app') {
        throw new Error(`Unexpected authentication response type: ${authResponse.for}`);
      }

      // Extract tokens from successful response
      const authData = authResponse.info;
      
      if (!authData || !authData.access_token) {
        throw new Error('Authentication response missing access_token in info field');
      }

      if (!authData.refresh_token) {
        console.log('⚠️  Authentication response missing refresh_token');
      }

      console.log('✅ Authentication successful:', authData.message || 'Tokens received');
      console.log(`   Access token: ${authData.access_token.substring(0, 20)}...`);
      console.log(`   Refresh token: ${authData.refresh_token ? authData.refresh_token.substring(0, 20) + '...' : 'Not provided'}`);

      // Store the new tokens securely
      if (this.authManager) {
        const refreshToken = authData.refresh_token || 'no_refresh_token';
        this.authManager.saveTokens(authData.access_token, refreshToken);
        console.log('✅ New tokens stored securely in encrypted storage');
      }

      return authData.access_token;

    } catch (error) {
      console.error('❌ Authentication failed:', error.message);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }
  getBaseConfig() {
    return {
      propertyId: this.propertyId,
      app_id: this.app_id,
      app_secret: this.app_secret,
      cmsServer: this.cmsServer
    };
  }

  /**
   * Fetch dynamic configuration parameters from the cloud API
   */
  async fetchDynamicConfig(forceSync = false) {
    try {
      if (forceSync) {
        console.log('🌐 Force sync requested - fetching fresh configuration from cloud...');
      } else {
        console.log('⚡ Fetching configuration from Cloud API...');
      }

      // Get access token from AuthManager or authenticate
      console.log('🔐 Getting access token...');
      
      let accessToken;
      
      if (!this.authManager) {
        console.log('⚠️  AuthManager not available, attempting direct authentication...');
        // If no AuthManager, authenticate directly
        accessToken = await this.authenticateWithAPI();
      } else {
        // Check if we have valid stored tokens
        if (this.authManager.hasValidTokens()) {
          accessToken = this.authManager.getAccessToken();
          console.log('✅ Using stored access token from AuthManager');
        } else {
          console.log('ℹ️  No valid stored tokens, authenticating to get new ones...');
          accessToken = await this.authenticateWithAPI();
        }
      }
      
      if (!accessToken) {
        throw new Error('Failed to obtain access token through authentication');
      }

      // Prepare configuration request as form data
      const requestParams = new URLSearchParams();
      requestParams.append('what_do_you_want', 'estv_get_ops_configuration');
      requestParams.append('propertyId', this.propertyId);
      requestParams.append('app_id', this.app_id);
      requestParams.append('app_secret', this.app_secret);
      if (forceSync) {
        requestParams.append('forceSync', 'true');
      }

      console.log('📤 Sending request to:', this.CLOUD_API_URL);
      console.log('📤 Request payload (as POST form data):');
      console.log('   what_do_you_want: estv_get_ops_configuration');
      console.log('   propertyId:', this.propertyId);
      console.log('   app_id:', this.app_id);
      console.log('   app_secret: [HIDDEN]');
      if (forceSync) {
        console.log('   forceSync: true');
      }
      console.log('🔐 Sending access token in header "xAwBo5Re9a"');

      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'xAwBo5Re9a': accessToken  // Send access token in custom header
      };

      console.log('📤 Request headers:', JSON.stringify({
        'Content-Type': headers['Content-Type'],
        'xAwBo5Re9a': '[ACCESS_TOKEN_SET]' // Don't log the actual token for security
      }, null, 2));

      const response = await fetch(this.CLOUD_API_URL, {
        method: 'POST',
        headers: headers,
        body: requestParams.toString()
      });

      console.log('📥 Response status:', response.status, response.statusText);

      console.log('📥 Response status:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();
      
      console.log('🔍 Raw API Response:', JSON.stringify(responseData, null, 2));
      
      // Handle array response format
      if (!Array.isArray(responseData) || responseData.length === 0) {
        throw new Error('Invalid API response format: expected array with data');
      }
      
      const apiResponse = responseData[0];
      
      // Check if the response indicates success
      if (apiResponse.type !== 'success') {
        // Handle authentication/authorization errors (498 or 427 codes)
        const httpCode = apiResponse.info?.http_code;
        const isAuthError = httpCode === '498' || httpCode === '427' || 
                           apiResponse.message?.toLowerCase().includes('access token is either expired or invalid');
        
        if (isAuthError) {
          console.log('🔐 Access token expired/invalid (HTTP ' + httpCode + '), attempting re-authentication...');
          
          if (this.authManager) {
            // Clear invalid tokens
            this.authManager.clearTokens();
          }
          
          // Authenticate to get new token
          const newAccessToken = await this.authenticateWithAPI();
          
          // Retry the original API call with new token
          console.log('🔄 Retrying configuration fetch with new access token...');
          
          // Prepare retry request as form data
          const retryParams = new URLSearchParams();
          retryParams.append('what_do_you_want', 'estv_get_ops_configuration');
          retryParams.append('propertyId', this.propertyId);
          retryParams.append('app_id', this.app_id);
          retryParams.append('app_secret', this.app_secret);
          if (forceSync) {
            retryParams.append('forceSync', 'true');
          }

          const retryHeaders = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'xAwBo5Re9a': newAccessToken  // Send new token in header
          };

          const retryResponse = await fetch(this.CLOUD_API_URL, {
            method: 'POST',
            headers: retryHeaders,
            body: retryParams.toString()
          });

          console.log('📥 Retry response status:', retryResponse.status, retryResponse.statusText);

          if (!retryResponse.ok) {
            throw new Error(`Retry HTTP ${retryResponse.status}: ${retryResponse.statusText}`);
          }

          const retryResponseData = await retryResponse.json();
          console.log('🔍 Retry API Response:', JSON.stringify(retryResponseData, null, 2));

          // Validate retry response
          if (!Array.isArray(retryResponseData) || retryResponseData.length === 0) {
            throw new Error('Invalid retry response format: expected array with data');
          }

          const retryApiResponse = retryResponseData[0];

          if (retryApiResponse.type !== 'success') {
            throw new Error(`Retry failed: ${retryApiResponse.type} - ${retryApiResponse.message || 'Unknown error'}`);
          }

          // Use retry response data instead
          console.log('✅ Retry successful, using new configuration data');
          const retryData = retryApiResponse.info;
          
          if (!retryData) {
            throw new Error('Retry response missing configuration data in info field');
          }

          // Validate retry data has required fields
          const requiredFields = ['on_premise_server_ip', 'broadcast_ip', 'broadcast_port', 'broadcast_interval'];
          const missingFields = requiredFields.filter(field => !retryData[field]);
          
          if (missingFields.length > 0) {
            throw new Error(`Retry response missing required fields: ${missingFields.join(', ')}`);
          }

          // Update with retry data instead of original data
          data = retryData;
          
        } else {
          // Handle other types of errors
          let errorMessage = `API returned error: ${apiResponse.type}`;
          
          if (apiResponse.message) {
            errorMessage += ` - ${apiResponse.message}`;
          }
          
          if (apiResponse.error) {
            errorMessage += ` - ${apiResponse.error}`;
          }
          
          if (apiResponse.info) {
            errorMessage += ` - Info: ${JSON.stringify(apiResponse.info)}`;
          }
          
          console.error('❌ Full API Error Response:', JSON.stringify(apiResponse, null, 2));
          throw new Error(errorMessage);
        }
      }
      
      // Check if it's the expected response type
      if (apiResponse.for !== 'estv_get_ops_configuration') {
        throw new Error(`Unexpected response type: ${apiResponse.for}`);
      }
      
      // Extract the actual configuration data
      const data = apiResponse.info;
      if (!data) {
        throw new Error('API response missing configuration data in info field');
      }
      
      // Validate that we received all required dynamic parameters
      const requiredFields = ['on_premise_server_ip', 'broadcast_ip', 'broadcast_port', 'broadcast_interval'];
      const missingFields = requiredFields.filter(field => !data[field]);
      
      if (missingFields.length > 0) {
        throw new Error(`API response missing required fields: ${missingFields.join(', ')}`);
      }
      
      console.log('✅ Successfully fetched configuration from Cloud API');
      console.log(`   Server Alias: ${data.alias || 'Not specified'}`);
      
      // Update dynamic parameters with correct attribute mapping
      this.onPremiseServer = data.on_premise_server_ip;
      this.broadcastPort = parseInt(data.broadcast_port);
      this.broadcastInterval = parseInt(data.broadcast_interval);
      this.broadcastIP = data.broadcast_ip;
      this.serverAlias = data.alias; // Store server alias for reference
      
      // Validate numeric fields
      if (isNaN(this.broadcastPort) || isNaN(this.broadcastInterval)) {
        throw new Error('Invalid numeric values received from API for port or interval');
      }
      
      // Also update propertyId from API if provided (for validation)
      if (data.property_id && data.property_id !== this.propertyId) {
        console.log(`⚠️  Property ID mismatch: Config=${this.propertyId}, API=${data.property_id}`);
        console.log('   Using API value for consistency...');
        this.propertyId = data.property_id;
      }
      
      this.isInitialized = true;
      
      // Check if API response includes new tokens to store
      if (this.authManager && data.access_token && data.refresh_token) {
        console.log('🔐 API response includes new tokens, storing securely...');
        this.authManager.saveTokens(data.access_token, data.refresh_token);
      } else if (this.authManager && (data.access_token || data.token)) {
        // Some APIs might return just access_token or token
        const newToken = data.access_token || data.token;
        console.log('🔐 API response includes access token, storing securely...');
        this.authManager.saveTokens(newToken, this.authManager.refreshToken || 'no_refresh_token');
      }
      
      // Update config.inc file with the new data
      await this.updateConfigFile(data);
      
      return this.getFullConfig();
      
    } catch (error) {
      console.error('❌ Failed to fetch configuration from Cloud API');
      console.error(`   Error: ${error.message}`);
      
      // Provide specific debugging information
      console.error('\n🔍 Debugging Information:');
      console.error(`   • API URL: ${this.CLOUD_API_URL}`);
      console.error(`   • Property ID: ${this.propertyId}`);
      console.error(`   • App ID: ${this.app_id}`);
      console.error(`   • App Secret: ${this.app_secret ? '[SET]' : '[NOT SET]'}`);
      console.error(`   • Force Sync: ${forceSync}`);
      console.error(`   • AuthManager: ${this.authManager ? 'Initialized' : 'Not Initialized'}`);
      
      console.error('\n❓ Possible Issues:');
      console.error('   • Authentication token expired or invalid');
      console.error('   • Invalid credentials (app_id, app_secret, or propertyId)');
      console.error('   • Network connectivity problems');
      console.error('   • CMS server is down or unreachable');
      console.error('   • Incorrect API endpoint URL');
      console.error('   • Server-side authentication or authorization failure');
      
      console.error('\n🔧 Troubleshooting Steps:');
      console.error('   1. Check AuthManager token generation and storage');
      console.error('   2. Verify your credentials in config.inc file');
      console.error('   3. Test network connectivity to the CMS server');
      console.error('   4. Check if the CMS server webservice is running');
      console.error('   5. Validate the cmsServer URL in config.inc');
      console.error('   6. Review auth.js for token generation issues');
      console.error('   7. Contact your system administrator if credentials are correct');
      
      console.error('\n❌ Cannot proceed without valid configuration from Cloud API');
      
      throw new Error(`Cloud API fetch failed: ${error.message}`);
    }
  }

  /**
   * Update config.inc file with data from Cloud API
   */
  async updateConfigFile(apiData) {
    try {
      console.log('📝 Updating config.inc file with Cloud API data...');
      
      // Read current config
      const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // Create updated config with API data
      const updatedConfig = {
        ...currentConfig,
        // Keep hardcoded values
        propertyId: currentConfig.propertyId,
        app_id: currentConfig.app_id,
        app_secret: currentConfig.app_secret,
        cmsServer: currentConfig.cmsServer,
        // Add/update dynamic values from API
        serverAlias: apiData.alias,
        onPremiseServer: apiData.on_premise_server_ip,
        broadcastIP: apiData.broadcast_ip,
        broadcastPort: apiData.broadcast_port,
        broadcastInterval: apiData.broadcast_interval,
        // Add timestamp of last sync
        lastSync: new Date().toISOString()
      };
      
      // Write updated config back to file
      fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2), 'utf8');
      
      console.log('✅ Successfully updated config.inc file');
      
    } catch (error) {
      console.error('⚠️  Failed to update config.inc file:', error.message);
      console.error('   Continuing with in-memory configuration...');
      // Don't throw error here - we can continue with in-memory config
    }
  }

  /**
   * Check if cached configuration exists in config.inc file
   */
  hasCachedConfig() {
    try {
      const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const requiredCachedFields = ['onPremiseServer', 'broadcastIP', 'broadcastPort', 'broadcastInterval'];
      
      const hasAllFields = requiredCachedFields.every(field => 
        currentConfig[field] !== undefined && currentConfig[field] !== null && currentConfig[field] !== ''
      );
      
      if (hasAllFields) {
        console.log('📋 Found cached configuration in config.inc');
        return true;
      } else {
        console.log('📋 No complete cached configuration found');
        return false;
      }
    } catch (error) {
      console.log('📋 No cached configuration available');
      return false;
    }
  }

  /**
   * Load cached configuration from config.inc file
   */
  loadCachedConfig() {
    try {
      const cachedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // Load cached dynamic parameters
      this.onPremiseServer = cachedConfig.onPremiseServer;
      this.broadcastPort = parseInt(cachedConfig.broadcastPort);
      this.broadcastInterval = parseInt(cachedConfig.broadcastInterval);
      this.broadcastIP = cachedConfig.broadcastIP;
      this.serverAlias = cachedConfig.serverAlias;
      
      // Update propertyId if available in cache
      if (cachedConfig.propertyId) {
        this.propertyId = cachedConfig.propertyId;
      }
      
      this.isInitialized = true;
      
      console.log('✅ Loaded cached configuration successfully');
      if (cachedConfig.serverAlias) {
        console.log(`   Server: ${cachedConfig.serverAlias}`);
      }
      if (cachedConfig.lastSync) {
        console.log(`   Last sync: ${new Date(cachedConfig.lastSync).toLocaleString()}`);
      }
      
      return this.getFullConfig();
      
    } catch (error) {
      throw new Error(`Failed to load cached configuration: ${error.message}`);
    }
  }
  getFullConfig() {
    if (!this.isInitialized) {
      throw new Error('Configuration not initialized. Call fetchDynamicConfig() first.');
    }
    
    return {
      propertyId: this.propertyId,
      app_id: this.app_id,
      app_secret: this.app_secret,
      cmsServer: this.cmsServer,
      onPremiseServer: this.onPremiseServer,
      broadcastPort: this.broadcastPort,
      broadcastInterval: this.broadcastInterval,
      broadcastIP: this.broadcastIP
    };
  }

  /**
   * Initialize the API client and fetch dynamic configuration
   */
  async initialize(forceSync = false) {
    if (forceSync) {
      // Force sync always fetches from API
      return await this.fetchDynamicConfig(true);
    } else {
      // Check if cached config exists
      if (this.hasCachedConfig()) {
        console.log('⚡ Using cached configuration...');
        return this.loadCachedConfig();
      } else {
        console.log('🌐 No cached config found, fetching from Cloud API...');
        return await this.fetchDynamicConfig(false);
      }
    }
  }
}

module.exports = ApiClient;