#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';
import express from 'express';
import cors from 'cors';

// Base URLs for Iplan services
const IPLAN_URLS = {
    // Main planning service
    xplan: "https://ags.iplan.gov.il/arcgis/rest/services/PlanningPublic/Xplan/MapServer",
    // Alternative URLs for different services
    mavat: "https://mavat.iplan.gov.il/rest",
    // Backup URL
    backup: "https://ims.gov.il/sites/gis"
};

// Environment flag for demo vs real data
const USE_REAL_API = process.env.USE_REAL_API === 'true' || false;

// Base44 Configuration
const base44Config = {
    appId: process.env.BASE44_APP_ID || null,
    apiKey: process.env.BASE44_API_KEY || null
};

// Base44 API URLs - Correct endpoints provided
const BASE44_API_BASE = `https://www.base44.com/api/v1/app/${process.env.BASE44_APP_ID || base44Config.appId}`;
const BASE44_API_ENDPOINTS = {
    conversations: `${BASE44_API_BASE}/entities/ChatConversation/records?filter_by=%7B%22status%22%3A%20%22active%22%7D&sort_by=-created_date&limit=1`,
    updateConversation: (conversationId) => `${BASE44_API_BASE}/entities/ChatConversation/records/${conversationId}`
};

// Track processed conversations
const processedConversationIds = new Set();
let pollingInterval = null;

class IplanMCPServer {
    server;
    app;
    pollingActive = false;

    constructor() {
        this.server = new Server({
            name: 'iplan-israel-planning',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {}
            }
        });
        this.app = express();
        this.setupExpress();
        this.setupToolHandlers();
    }

    setupExpress() {
        this.app.use(cors());
        this.app.use(express.json());
        
        // Health check endpoint
        this.app.get('/', (req, res) => {
            const isRealMode = process.env.USE_REAL_API === 'true';
            res.json({ 
                status: 'running', 
                server: 'Iplan MCP Server with Proxy',
                version: '2.0.0',
                current_mode: isRealMode ? 'real' : 'demo',
                mode_description: isRealMode ? 
                    'Using REAL API calls to Israel Planning Administration' :
                    'Using DEMO data for testing purposes',
                endpoints: {
                    health: '/',
                    mcp: '/sse',
                    test: '/test-iplan',
                    proxy_search: '/api/search-plans',
                    iplan_status: '/api/check-iplan-connection',
                    toggle_mode: '/api/toggle-real-mode',
                    current_mode: '/api/current-mode',
                    tools: '/api/tools',
                    call: '/api/call'
                },
                features: [
                    'MCP Protocol Support',
                    'REST API Interface', 
                    'Real-time Iplan Proxy',
                    'Demo/Real Mode Toggle',
                    'CORS Support',
                    'Base44 Integration'
                ]
            });
        });

        // Test Iplan connectivity
        this.app.get('/test-iplan', async (req, res) => {
            res.json({
                status: 'testing',
                message: 'Testing multiple Iplan endpoints...',
                base_url: BASE_URL,
                endpoints_to_test: [
                    `${BASE_URL}`,
                    `${BASE_URL}/api`,
                    `${BASE_URL}/api/Plans`,
                    'https://mavat.iplan.gov.il',
                    'https://ags.iplan.gov.il'
                ],
                note: 'This is a safe test that won\'t crash the server'
            });
        });

        // ====================================================================
        // ===            REST API endpoints for external systems         ===
        // ====================================================================

        // 1. Get available tools
        this.app.get('/api/tools', (req, res) => {
            console.log("Received request for /api/tools");
            res.json({ 
                tools: [
                    {
                        name: 'search_plans',
                        description: 'חיפוש תכניות במינהל התכנון הישראלי עם פילטרים מתקדמים',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                searchTerm: {
                                    type: 'string',
                                    description: 'שם או מספר תכנית לחיפוש'
                                },
                                district: {
                                    type: 'string',
                                    description: 'מחוז (תל אביב, ירושלים, חיפה, מחוז הצפון, מחוז המרכז, מחוז הדרום)'
                                }
                            }
                        }
                    },
                    {
                        name: 'get_plan_details',
                        description: 'קבלת פרטי תכנית ספציפית לפי מספר תכנית',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                planNumber: {
                                    type: 'string',
                                    description: 'מספר התכנית'
                                }
                            },
                            required: ['planNumber']
                        }
                    },
                    {
                        name: 'search_by_location',
                        description: 'חיפוש תכניות לפי מיקום גיאוגרפי',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                x: {
                                    type: 'number',
                                    description: 'קואורדינטת X (longitude)'
                                },
                                y: {
                                    type: 'number', 
                                    description: 'קואורדינטת Y (latitude)'
                                },
                                radius: {
                                    type: 'number',
                                    description: 'רדיוס חיפוש במטרים'
                                }
                            },
                            required: ['x', 'y']
                        }
                    }
                ]
            });
        });

        // 2. Execute tool
        this.app.post('/api/call', async (req, res) => {
            const { name, arguments: args } = req.body;
            console.log(`Received API call for tool: ${name} with args:`, args);

            if (!name) {
                return res.status(400).json({ error: 'Tool name is required' });
            }

            try {
                let result;
                switch (name) {
                    case 'search_plans':
                        result = await this.searchPlans(args);
                        break;
                    case 'get_plan_details':
                        result = await this.getPlanDetails(args?.planNumber);
                        break;
                    case 'search_by_location':
                        result = await this.searchByLocation(args?.x, args?.y, args?.radius);
                        break;
                    default:
                        throw new Error(`Tool '${name}' not found`);
                }
                res.json(result);
            } catch (error) {
                console.error(`Error executing tool '${name}':`, error);
                res.status(500).json({ error: error.message });
            }
        });

        // 3. Configure Base44 credentials (for setup)
        this.app.post('/api/configure', (req, res) => {
            const { app_id, api_key } = req.body;
            
            if (!app_id || !api_key) {
                return res.status(400).json({ 
                    error: 'app_id and api_key are required',
                    example: {
                        app_id: 'your_base44_app_id',
                        api_key: 'your_base44_api_key'
                    }
                });
            }

            // Update environment variables (for current session)
            process.env.BASE44_APP_ID = app_id;
            process.env.BASE44_API_KEY = api_key;
            
            console.log(`Base44 credentials updated: App ID = ${app_id}`);
            
            // Start polling if not already running
            if (!this.pollingActive) {
                console.log('Starting Base44 polling with new credentials...');
                this.startPolling();
                this.pollingActive = true;
            }

            res.json({
                message: 'Base44 credentials configured successfully',
                polling_status: 'active',
                app_id: app_id
            });
        });

        // 4. Proxy endpoint for direct Iplan communication (for Base44)
        this.app.post('/api/search-plans', async (req, res) => {
            const startTime = Date.now();
            console.log("Received proxy request for /api/search-plans");
            
            try {
                const { where, resultRecordCount = 50, orderByFields = 'pl_date_8 DESC' } = req.body;
                
                if (!where) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required parameter: where'
                    });
                }

                // Try multiple endpoints for robustness
                const endpoints = [
                    `${IPLAN_URLS.xplan}/0/query`,
                    `${IPLAN_URLS.xplan}/1/query`,
                ];

                let lastError = null;
                
                for (const endpoint of endpoints) {
                    try {
                        const params = new URLSearchParams({
                            'f': 'json',
                            'where': where,
                            'outFields': '*',
                            'returnGeometry': 'false',
                            'resultRecordCount': resultRecordCount.toString(),
                            'orderByFields': orderByFields
                        });

                        console.log(`Trying endpoint: ${endpoint}?${params}`);
                        
                        const response = await fetch(`${endpoint}?${params}`, {
                            method: 'GET',
                            headers: {
                                'Accept': 'application/json',
                                'User-Agent': 'IplanProxyServer/1.0',
                                'Referer': 'https://ags.iplan.gov.il'
                            },
                            timeout: 15000
                        });

                        if (!response.ok) {
                            lastError = `HTTP ${response.status}: ${response.statusText}`;
                            console.log(`Endpoint failed: ${lastError}`);
                            continue;
                        }

                        const result = await response.json();
                        
                        if (result.error) {
                            lastError = result.error.message || 'API Error';
                            console.log(`API Error: ${lastError}`);
                            continue;
                        }

                        const executionTime = ((Date.now() - startTime) / 1000).toFixed(1);
                        
                        return res.json({
                            success: true,
                            data: result.features || [],
                            total: (result.features || []).length,
                            execution_time: `${executionTime}s`,
                            endpoint_used: endpoint
                        });
                        
                    } catch (error) {
                        lastError = error.message;
                        console.log(`Endpoint error: ${error.message}`);
                        continue;
                    }
                }

                // If all endpoints failed
                return res.status(500).json({
                    success: false,
                    error: `All endpoints failed. Last error: ${lastError}`,
                    endpoints_tried: endpoints
                });

            } catch (error) {
                console.error("Error in proxy search:", error);
                return res.status(500).json({
                    success: false,
                    error: `Server error: ${error.message}`
                });
            }
        });

        // 5. Check Iplan connection status
        this.app.get('/api/check-iplan-connection', async (req, res) => {
            console.log("Checking Iplan connection status");
            
            const results = [];
            const endpoints = [
                { name: 'XPlan Layer 0', url: `${IPLAN_URLS.xplan}/0/query?f=json&where=1%3D1&returnCountOnly=true` },
                { name: 'XPlan Layer 1', url: `${IPLAN_URLS.xplan}/1/query?f=json&where=1%3D1&returnCountOnly=true` },
                { name: 'Service Info', url: `${IPLAN_URLS.xplan}?f=json` }
            ];

            for (const endpoint of endpoints) {
                try {
                    const startTime = Date.now();
                    const response = await fetch(endpoint.url, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                            'User-Agent': 'IplanProxyServer/1.0'
                        },
                        timeout: 10000
                    });

                    const responseTime = Date.now() - startTime;
                    const data = await response.json();
                    
                    results.push({
                        name: endpoint.name,
                        status: response.ok ? 'online' : 'error',
                        responseTime: `${responseTime}ms`,
                        url: endpoint.url,
                        data: response.ok ? (data.count !== undefined ? `${data.count} records` : 'service info') : 'failed'
                    });

                } catch (error) {
                    results.push({
                        name: endpoint.name,
                        status: 'offline',
                        responseTime: 'timeout',
                        url: endpoint.url,
                        error: error.message
                    });
                }
            }

            const onlineCount = results.filter(r => r.status === 'online').length;
            const overallStatus = onlineCount > 0 ? 'partial' : 'offline';
            if (onlineCount === results.length) overallStatus = 'online';

            res.json({
                overall_status: overallStatus,
                endpoints: results,
                timestamp: new Date().toISOString(),
                summary: `${onlineCount}/${results.length} endpoints online`
            });
        });

        // 6. Toggle real API mode
        this.app.post('/api/toggle-real-mode', (req, res) => {
            const { enabled } = req.body;
            process.env.USE_REAL_API = enabled ? 'true' : 'false';
            
            console.log(`API mode switched to: ${enabled ? 'REAL DATA' : 'DEMO DATA'}`);
            
            res.json({
                success: true,
                message: `API mode switched to ${enabled ? 'REAL DATA' : 'DEMO DATA'}`,
                current_mode: enabled ? 'real' : 'demo',
                USE_REAL_API: process.env.USE_REAL_API === 'true'
            });
        });

        // 7. Get current mode
        this.app.get('/api/current-mode', (req, res) => {
            const isRealMode = process.env.USE_REAL_API === 'true';
            res.json({
                mode: isRealMode ? 'real' : 'demo',
                USE_REAL_API: isRealMode,
                description: isRealMode ? 
                    'Server is using REAL API calls to Israel Planning Administration' :
                    'Server is using DEMO data for testing purposes'
            });
        });

        // MCP endpoint - SSE Transport
        this.app.use('/sse', (req, res, next) => {
            // Set CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            
            if (req.method === 'OPTIONS') {
                res.sendStatus(204);
                return;
            }
            
            // Set SSE headers for GET requests
            if (req.method === 'GET') {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
            }
            
            // Create transport for this connection
            const transport = new SSEServerTransport('/sse', res);
            this.server.connect(transport);
        });
    }

    setupToolHandlers() {
        // כל הקוד של setupToolHandlers נשאר זהה...
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'search_plans',
                        description: 'חיפוש תכניות במינהל התכנון הישראלי עם פילטרים מתקדמים',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                searchTerm: {
                                    type: 'string',
                                    description: 'שם או מספר תכנית לחיפוש'
                                },
                                district: {
                                    type: 'string',
                                    description: 'מחוז (תל אביב, ירושלים, חיפה, מחוז הצפון, מחוז המרכז, מחוז הדרום)'
                                },
                                minArea: {
                                    type: 'number',
                                    description: 'שטח מינימלי בדונמים'
                                },
                                maxArea: {
                                    type: 'number',
                                    description: 'שטח מקסימלי בדונמים'
                                },
                                planAreaName: {
                                    type: 'string',
                                    description: 'אזור תכנית פנימי (לדוגמה: ירושלים מערב)'
                                },
                                cityName: {
                                    type: 'string',
                                    description: 'שם עיר או אזור סמכות (לדוגמה: עיריית תל אביב)'
                                },
                                landUse: {
                                    type: 'string',
                                    description: 'ייעוד קרקע (מגורים, מסחר, תעשיה, וכו\')'
                                },
                                minDate: {
                                    type: 'string',
                                    description: 'תאריך אישור מינימלי (YYYY-MM-DD)'
                                },
                                maxDate: {
                                    type: 'string',
                                    description: 'תאריך אישור מקסימלי (YYYY-MM-DD)'
                                },
                                minHousingUnits: {
                                    type: 'number',
                                    description: 'מספר יחידות דיור מינימלי'
                                },
                                maxHousingUnits: {
                                    type: 'number',
                                    description: 'מספר יחידות דיור מקסימלי'
                                },
                                minRoomsSqM: {
                                    type: 'number',
                                    description: 'שטח חדרים מינימלי במ״ר'
                                },
                                maxRoomsSqM: {
                                    type: 'number',
                                    description: 'שטח חדרים מקסימלי במ״ר'
                                },
                                minYear: {
                                    type: 'number',
                                    description: 'שנת אישור מינימלית'
                                },
                                maxYear: {
                                    type: 'number',
                                    description: 'שנת אישור מקסימלית'
                                }
                            }
                        }
                    },
                    {
                        name: 'get_plan_details',
                        description: 'קבלת פרטי תכנית ספציפית לפי מספר תכנית',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                planNumber: {
                                    type: 'string',
                                    description: 'מספר התכנית'
                                }
                            },
                            required: ['planNumber']
                        }
                    },
                    {
                        name: 'search_by_location',
                        description: 'חיפוש תכניות לפי מיקום גיאוגרפי',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                x: {
                                    type: 'number',
                                    description: 'קואורדינטת X (longitude)'
                                },
                                y: {
                                    type: 'number', 
                                    description: 'קואורדינטת Y (latitude)'
                                },
                                radius: {
                                    type: 'number',
                                    description: 'רדיוס חיפוש במטרים'
                                }
                            },
                            required: ['x', 'y']
                        }
                    }
                ]
            };
        });

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                switch (name) {
                    case 'search_plans':
                        return await this.searchPlans(args);
                    case 'get_plan_details':
                        return await this.getPlanDetails(args?.planNumber);
                    case 'search_by_location':
                        return await this.searchByLocation(args?.x, args?.y, args?.radius);
                    case 'get_building_restrictions':
                        return await this.getBuildingRestrictions(args?.x, args?.y, args?.buffer);
                    case 'get_infrastructure_data':
                        return await this.getInfrastructureData(args?.infrastructureType, args?.whereClause);
                    case 'get_conservation_sites':
                        return await this.getConservationSites(args);
                    case 'get_comprehensive_location_data':
                        return await this.getComprehensiveLocationData(args?.x, args?.y, args?.radius);
                    case 'check_service_status':
                        return await this.checkServiceStatus();
                    default:
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
                }
            } catch (error) {
                if (error instanceof McpError) {
                    throw error;
                }
                throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }

    // כל הפונקציות האחרות נשארות זהות...
    buildWhereClause(params) {
        const conditions = [];
        if (params.searchTerm) {
            conditions.push(`(pl_name LIKE '%${params.searchTerm}%' OR pl_number LIKE '%${params.searchTerm}%')`);
        }
        if (params.district) {
            conditions.push(`district_name LIKE '%${params.district}%'`);
        }
        if (params.minArea) {
            conditions.push(`pl_area_dunam >= ${params.minArea}`);
        }
        if (params.maxArea) {
            conditions.push(`pl_area_dunam <= ${params.maxArea}`);
        }
        if (params.planAreaName) {
            conditions.push(`plan_area_name LIKE '%${params.planAreaName}%'`);
        }
        if (params.cityName) {
            conditions.push(`jurstiction_area_name LIKE '%${params.cityName}%'`);
        }
        if (params.landUse) {
            conditions.push(`pl_landuse_string LIKE '%${params.landUse}%'`);
        }
        if (params.minHousingUnits) {
            conditions.push(`pq_authorised_quantity_105 >= ${params.minHousingUnits}`);
        }
        if (params.maxHousingUnits) {
            conditions.push(`pq_authorised_quantity_105 <= ${params.maxHousingUnits}`);
        }
        if (params.minRoomsSqM) {
            conditions.push(`pq_authorised_quantity_110 >= ${params.minRoomsSqM}`);
        }
        if (params.maxRoomsSqM) {
            conditions.push(`pq_authorised_quantity_110 <= ${params.maxRoomsSqM}`);
        }
        return conditions.length > 0 ? conditions.join(' AND ') : '1=1';
    }

    async searchPlans(params) {
        console.log('Executing searchPlans with:', params);
        
        if (USE_REAL_API || process.env.USE_REAL_API === 'true') {
            return await this.searchPlansReal(params);
        }
        
        // For demonstration, return mock data since the real API endpoints are not accessible
        const mockResults = [
            {
                planName: `תכנית דוגמה עבור ${params.searchTerm || 'חיפוש כללי'}`,
                planNumber: "תב/123/45",
                district: params.district || "מחוז המרכז",
                planArea: "אזור מרכזי",
                areaDunam: "150.5",
                approvalDate: "2023-01-15",
                planUrl: "https://mavat.iplan.gov.il/plan/123",
                jurisdiction: "עיריית תל אביב",
                landUse: "מגורים ומסחר",
                housingUnits: "250",
                roomsSqM: "18500"
            },
            {
                planName: `תכנית נוספת - ${params.searchTerm || 'חיפוש'}`,
                planNumber: "תב/456/78",
                district: params.district || "מחוז המרכז",
                planArea: "אזור צפוני",
                areaDunam: "85.2",
                approvalDate: "2023-06-10",
                planUrl: "https://mavat.iplan.gov.il/plan/456",
                jurisdiction: "עיריית רמת גן",
                landUse: "מגורים",
                housingUnits: "120",
                roomsSqM: "9600"
            }
        ];

        return {
            content: [
                {
                    type: 'text',
                    text: `נמצאו ${mockResults.length} תוצאות (נתונים לדוגמה):\n\n${JSON.stringify(mockResults, null, 2)}\n\n⚠️  שים לב: זהו שרת הדגמה עם נתונים לדוגמה. ה-API האמיתי של מינהל התכנון אינו זמין כרגע.`
                }
            ]
        };
    }

    async searchPlansReal(params) {
        console.log('Executing REAL searchPlans with:', params);
        
        try {
            const whereClause = this.buildWhereClause(params);
            
            // Use the new proxy endpoint internally
            const proxyRequest = {
                where: whereClause,
                resultRecordCount: 100,
                orderByFields: 'pl_date_8 DESC'
            };

            const endpoints = [
                `${IPLAN_URLS.xplan}/0/query`,
                `${IPLAN_URLS.xplan}/1/query`,
            ];

            let lastError = null;
            
            for (const endpoint of endpoints) {
                try {
                    const searchParams = new URLSearchParams({
                        'f': 'json',
                        'where': whereClause,
                        'outFields': 'pl_name,pl_number,district_name,plan_area_name,pl_area_dunam,pl_date_8,pl_url,jurstiction_area_name,pl_landuse_string,pq_authorised_quantity_105,pq_authorised_quantity_110,pq_authorised_quantity_120',
                        'returnGeometry': 'false',
                        'resultRecordCount': '100',
                        'orderByFields': 'pl_date_8 DESC'
                    });

                    console.log(`Making REAL request to: ${endpoint}?${searchParams}`);
                    
                    const response = await fetch(`${endpoint}?${searchParams}`, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                            'User-Agent': 'IplanMCPServer/1.0',
                            'Referer': 'https://ags.iplan.gov.il'
                        },
                        timeout: 15000
                    });

                    if (!response.ok) {
                        lastError = `HTTP ${response.status}: ${response.statusText}`;
                        console.log(`Real endpoint failed: ${lastError}`);
                        continue;
                    }

                    const data = await response.json();
                    
                    if (data.error) {
                        lastError = data.error.message || 'API Error';
                        console.log(`Real API Error: ${lastError}`);
                        continue;
                    }

                    const results = data.features || [];
                    const formattedResults = results.map(feature => ({
                        planName: feature.attributes?.pl_name || 'N/A',
                        planNumber: feature.attributes?.pl_number || 'N/A',
                        district: feature.attributes?.district_name || 'N/A',
                        planArea: feature.attributes?.plan_area_name || 'N/A',
                        areaDunam: feature.attributes?.pl_area_dunam || 'N/A',
                        approvalDate: feature.attributes?.pl_date_8 || 'N/A',
                        planUrl: feature.attributes?.pl_url || 'N/A',
                        jurisdiction: feature.attributes?.jurstiction_area_name || 'N/A',
                        landUse: feature.attributes?.pl_landuse_string || 'N/A',
                        housingUnits: feature.attributes?.pq_authorised_quantity_105 || 'N/A',
                        roomsSqM: feature.attributes?.pq_authorised_quantity_110 || 'N/A'
                    }));

                    return {
                        content: [
                            {
                                type: 'text',
                                text: `נמצאו ${results.length} תוצאות אמיתיות ממינהל התכנון:\n\n${JSON.stringify(formattedResults, null, 2)}\n\n✅ נתונים אמיתיים ממינהל התכנון!`
                            }
                        ]
                    };

                } catch (error) {
                    lastError = error.message;
                    console.log(`Real endpoint error: ${error.message}`);
                    continue;
                }
            }

            // If all real endpoints failed, fall back to demo data
            console.log('All real endpoints failed, falling back to demo data');
            return {
                content: [
                    {
                        type: 'text',
                        text: `⚠️ שגיאה בחיבור למינהל התכנון: ${lastError}\n\nמציג נתוני דוגמה במקום:\n\n${JSON.stringify([
                            {
                                planName: `תכנית דוגמה (שגיאת חיבור) עבור ${params.searchTerm || 'חיפוש'}`,
                                planNumber: "שגיאה/123/45",
                                district: params.district || "מחוז המרכז",
                                error: lastError
                            }
                        ], null, 2)}`
                    }
                ]
            };

        } catch (error) {
            console.error('Error in searchPlansReal:', error);
            return {
                content: [
                    {
                        type: 'text',
                        text: `שגיאה כללית בחיפוש אמיתי: ${error.message}`
                    }
                ]
            };
        }
    }

    async getPlanDetails(planNumber) {
        console.log('Executing getPlanDetails for plan:', planNumber);
        
        // Mock data for demonstration
        const planDetails = {
            planName: `תכנית מפורטת ${planNumber}`,
            planNumber: planNumber,
            district: "מחוז המרכז",
            planArea: "אזור תכנון מרכזי",
            areaDunam: "125.8",
            approvalDate: "2023-03-20",
            planUrl: `https://mavat.iplan.gov.il/plan/${planNumber}`,
            jurisdiction: "עיריית תל אביב",
            landUse: "מגורים, מסחר ושירותים",
            housingUnits: "180",
            roomsSqM: "14400",
            publicAreaSqM: "3200",
            planStatus: "מאושרת",
            planType: "תכנית מפורטת",
            description: "תכנית להקמת שכונת מגורים חדשה עם שטחי מסחר ושירותים",
            buildingRights: {
                maxFloors: "8",
                buildingRatio: "0.6",
                openSpaceRatio: "0.4"
            }
        };

        return {
            content: [
                {
                    type: 'text',
                    text: `פרטי תכנית ${planNumber} (נתונים לדוגמה):\n\n${JSON.stringify(planDetails, null, 2)}\n\n⚠️  שים לב: זהו שרת הדגמה עם נתונים לדוגמה.`
                }
            ]
        };
    }

    async searchByLocation(x, y, radius = 1000) {
        console.log('Executing searchByLocation with:', { x, y, radius });
        
        // Mock data based on coordinates
        const mockResults = [
            {
                planName: `תכנית קרובה לקואורדינטות ${x}, ${y}`,
                planNumber: "גב/789/12",
                district: "מחוז המרכז",
                planArea: "אזור מגורים",
                areaDunam: "95.3",
                approvalDate: "2023-08-15",
                planUrl: "https://mavat.iplan.gov.il/plan/789",
                jurisdiction: "עיריית גבעתיים",
                landUse: "מגורים",
                housingUnits: "85",
                roomsSqM: "6800",
                distanceFromPoint: Math.round(Math.random() * radius) + "m"
            },
            {
                planName: `תכנית מסחרית באזור`,
                planNumber: "רג/345/67",
                district: "מחוז המרכז",
                planArea: "מרכז מסחרי",
                areaDunam: "45.7",
                approvalDate: "2023-05-30",
                planUrl: "https://mavat.iplan.gov.il/plan/345",
                jurisdiction: "עיריית רמת גן",
                landUse: "מסחר ושירותים",
                housingUnits: "0",
                roomsSqM: "0",
                distanceFromPoint: Math.round(Math.random() * radius) + "m"
            }
        ];

        return {
            content: [
                {
                    type: 'text',
                    text: `נמצאו ${mockResults.length} תכניות באזור (${x}, ${y}) ברדיוס ${radius} מטר (נתונים לדוגמה):\n\n${JSON.stringify(mockResults, null, 2)}\n\n⚠️  שים לב: זהו שרת הדגמה עם נתונים לדוגמה.`
                }
            ]
        };
    }

    // Base44 Integration Functions - Real API implementation
    async checkForNewMessages() {
        console.log("Checking for new conversations via Base44 API...");
        
        if (!base44Config.appId || !base44Config.apiKey) {
            console.log("Base44 credentials not configured");
            return;
        }
        
        try {
            const response = await fetch(BASE44_API_ENDPOINTS.conversations, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${base44Config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            if (!response.ok) {
                throw new Error(`Base44 API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            if (!data.success) {
                console.log("No success flag in Base44 response");
                return;
            }

            const conversations = data.data || [];
            console.log(`✅ Found ${conversations.length} active conversation(s)`);

            for (const conversation of conversations) {
                // Check if conversation has messages and hasn't been processed
                if (!conversation.messages || conversation.messages.length === 0) {
                    console.log(`Skipping conversation ${conversation.id} - no messages`);
                    continue;
                }

                const lastMessage = conversation.messages[conversation.messages.length - 1];
                
                // Process only user messages that haven't been processed yet
                if (lastMessage.role === 'user' && !processedConversationIds.has(conversation.id)) {
                    console.log(`🔥 NEW MESSAGE in conversation ${conversation.id}:`);
                    console.log(`Content: "${lastMessage.content}"`);
                    console.log(`Created: ${conversation.created_date}`);
                    
                    // Mark as being processed
                    processedConversationIds.add(conversation.id);
                    
                    // Process the conversation
                    await this.processAndRespond(conversation);
                } else if (processedConversationIds.has(conversation.id)) {
                    console.log(`Conversation ${conversation.id} already processed, skipping`);
                }
            }
            
        } catch (error) {
            console.error("❌ Error checking Base44 messages:", error.message);
        }
    }

    async processAndRespond(conversation) {
        const lastMessage = conversation.messages[conversation.messages.length - 1];
        const userQuery = lastMessage.content;
        
        console.log(`🤖 Processing user query: "${userQuery}"`);
        console.log(`📅 Message timestamp: ${lastMessage.timestamp}`);

        try {
            // Enhanced AI logic to choose tool based on keywords
            let toolToCall = 'search_plans'; // default
            let toolArgs = {};

            // Hebrew and English keyword detection
            const queryLower = userQuery.toLowerCase();
            
            if (queryLower.includes('מספר') || queryLower.includes('תכנית') || 
                queryLower.includes('plan') || queryLower.includes('details')) {
                toolToCall = 'get_plan_details';
                // Extract plan number if possible
                const planMatch = userQuery.match(/[\d\/\-]+/);
                if (planMatch) {
                    toolArgs = { planNumber: planMatch[0] };
                }
            } else if (queryLower.includes('מיקום') || queryLower.includes('קואורדינט') || 
                       queryLower.includes('location') || queryLower.includes('coordinates')) {
                toolToCall = 'search_by_location';
                // Try to extract coordinates, otherwise use Tel Aviv default
                const coordMatch = userQuery.match(/(\d+\.?\d*),?\s*(\d+\.?\d*)/);
                if (coordMatch) {
                    toolArgs = { 
                        x: parseFloat(coordMatch[1]), 
                        y: parseFloat(coordMatch[2]), 
                        radius: 1000 
                    };
                } else {
                    toolArgs = { x: 34.7818, y: 32.0853, radius: 1000 }; // Tel Aviv default
                }
            } else {
                // Enhanced search terms extraction
                const districts = ['תל אביב', 'ירושלים', 'חיפה', 'צפון', 'מרכז', 'דרום', 'tel aviv', 'jerusalem', 'haifa'];
                const foundDistrict = districts.find(d => queryLower.includes(d.toLowerCase()));
                
                // Extract land use keywords
                const landUses = ['מגורים', 'מסחר', 'תעשיה', 'ציבורי', 'residential', 'commercial', 'industrial'];
                const foundLandUse = landUses.find(l => queryLower.includes(l.toLowerCase()));
                
                toolArgs = {
                    searchTerm: userQuery.substring(0, 100), // First 100 chars
                    district: foundDistrict || undefined,
                    landUse: foundLandUse || undefined
                };
            }

            console.log(`🎯 Selected tool: ${toolToCall}`);
            console.log(`📋 Tool arguments:`, toolArgs);

            // Call the appropriate tool function
            let result;
            switch (toolToCall) {
                case 'search_plans':
                    result = await this.searchPlans(toolArgs);
                    break;
                case 'get_plan_details':
                    result = await this.getPlanDetails(toolArgs.planNumber);
                    break;
                case 'search_by_location':
                    result = await this.searchByLocation(toolArgs.x, toolArgs.y, toolArgs.radius);
                    break;
                default:
                    result = { content: [{ type: 'text', text: 'כלי לא זמין - אנא נסה שוב' }] };
            }

            console.log(`📊 Tool execution completed for ${toolToCall}`);

            // Send response back to Base44
            await this.sendResponseToBase44(conversation.id, toolToCall, result);

        } catch (error) {
            console.error(`❌ Error processing conversation ${conversation.id}:`, error.message);
            
            // Send error response to Base44
            await this.sendResponseToBase44(conversation.id, 'error', {
                content: [{ type: 'text', text: `שגיאה בעיבוד הבקשה: ${error.message}\n\nאנא נסה שוב מאוחר יותר.` }]
            });
        }
    }

    async sendResponseToBase44(conversationId, toolName, result) {
        try {
            console.log(`📤 Sending response for conversation ${conversationId}`);
            console.log(`Tool used: ${toolName}`);
            
            // First, add our response message to the conversation
            const responseMessage = {
                id: `msg_${Date.now()}`,
                role: "assistant",
                content: result.content[0].text,
                timestamp: new Date().toISOString(),
                tool_used: toolName
            };
            
            console.log(`Response preview: ${result.content[0].text.substring(0, 100)}...`);
            
            // Update conversation status to archived as per Base44 specification
            const updateResponse = await fetch(BASE44_API_ENDPOINTS.updateConversation(conversationId), {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${base44Config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: "archived"
                }),
                timeout: 10000
            });

            if (!updateResponse.ok) {
                throw new Error(`Failed to archive conversation: ${updateResponse.status} ${updateResponse.statusText}`);
            }

            console.log(`✅ Successfully processed and archived conversation ${conversationId}`);
            console.log(`🎯 Tool: ${toolName} | Status: archived`);
            
            // Remove from processed set after 5 minutes to allow reprocessing if needed
            setTimeout(() => {
                processedConversationIds.delete(conversationId);
                console.log(`🔄 Conversation ${conversationId} removed from processed cache`);
            }, 300000);

        } catch (error) {
            console.error(`❌ Error sending response to Base44 for conversation ${conversationId}:`, error.message);
            
            // Remove from processed set on error so it can be retried
            setTimeout(() => processedConversationIds.delete(conversationId), 30000);
        }
    }

    startPolling() {
        console.log("Starting Base44 polling system...");
        // Poll every 5 seconds
        setInterval(() => {
            this.checkForNewMessages();
        }, 5000);
    }

    async run() {
        const PORT = process.env.PORT || 10000;
        const HOST = process.env.HOST || '0.0.0.0';
        
        this.app.listen(PORT, HOST, () => {
            console.log(`Iplan MCP Server running on http://${HOST}:${PORT}`);
            console.log(`Health check: http://${HOST}:${PORT}/`);
            console.log(`MCP endpoint: http://${HOST}:${PORT}/sse`);
            console.log(`REST API: http://${HOST}:${PORT}/api/tools`);
            
            // Start Base44 polling if credentials are provided
            if (base44Config.appId && base44Config.apiKey) {
                console.log(`Starting Base44 integration with App ID: ${base44Config.appId}`);
                this.startPolling();
            } else {
                console.log('Base44 credentials not configured - polling disabled');
                console.log('Set BASE44_APP_ID and BASE44_API_KEY environment variables to enable');
            }
        });
    }
}

const server = new IplanMCPServer();
server.run().catch(console.error);