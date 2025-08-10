#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';
import express from 'express';
import cors from 'cors';

// Base URL for Iplan services - Updated URL
const BASE_URL = "https://ims.gov.il/arcgis/rest/services/IplanPublic";

class IplanMCPServer {
    server;
    app;

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
            res.json({ 
                status: 'running', 
                server: 'Iplan MCP Server',
                version: '1.0.0',
                endpoints: {
                    health: '/',
                    mcp: '/sse',
                    test: '/test-iplan'
                }
            });
        });

        // Test Iplan connectivity
        this.app.get('/test-iplan', async (req, res) => {
            try {
                const testUrl = `${BASE_URL}/Xplan/MapServer?f=json`;
                const response = await fetch(testUrl);
                const data = await response.json();
                res.json({
                    status: 'success',
                    iplan_connectivity: 'working',
                    url_tested: testUrl,
                    response_data: data
                });
            } catch (error) {
                res.json({
                    status: 'error',
                    iplan_connectivity: 'failed',
                    error: error.message,
                    url_tested: `${BASE_URL}/Xplan/MapServer?f=json`
                });
            }
        });

        // MCP endpoint
        this.app.use('/sse', (req, res, next) => {
            const transport = new SSEServerTransport('/sse', res);
            this.server.connect(transport);
            next();
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
                    // שאר הכלים...
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
        // ... שאר התנאים
        return conditions.length > 0 ? conditions.join(' AND ') : '1=1';
    }

    async searchPlans(params) {
        const whereClause = this.buildWhereClause(params);
        const url = `${BASE_URL}/PlanningPublic/Xplan/MapServer/1/query`;
        const searchParams = new URLSearchParams({
            'where': whereClause,
            'outFields': 'pl_name,pl_number,district_name,plan_area_name,pl_area_dunam,pl_date_8,pl_url,jurstiction_area_name,pl_landuse_string,pq_authorised_quantity_105,pq_authorised_quantity_110,pq_authorised_quantity_120',
            'f': 'json',
            'returnGeometry': 'false'
        });

        const response = await fetch(`${url}?${searchParams}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data?.error) {
            throw new Error(`API Error: ${data.error.message}`);
        }

        const results = data?.features || [];
        return {
            content: [
                {
                    type: 'text',
                    text: `נמצאו ${results.length} תוצאות:\n\n${JSON.stringify(results, null, 2)}`
                }
            ]
        };
    }

    // שאר הפונקציות נשארות זהות...

    async run() {
        const PORT = process.env.PORT || 10000;
        const HOST = process.env.HOST || '0.0.0.0';
        
        this.app.listen(PORT, HOST, () => {
            console.log(`Iplan MCP Server running on http://${HOST}:${PORT}`);
            console.log(`Health check: http://${HOST}:${PORT}/`);
            console.log(`MCP endpoint: http://${HOST}:${PORT}/sse`);
        });
    }
}

const server = new IplanMCPServer();
server.run().catch(console.error);