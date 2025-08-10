#!/usr/bin/env node

import localtunnel from 'localtunnel';

async function startIplanTunnel() {
  try {
    console.log('Starting tunnel for Iplan server on port 3000...');
    
    const tunnel = await localtunnel({ 
      port: 3000,
      subdomain: 'iplan-server-' + Math.random().toString(36).substring(7)
    });

    console.log('\n✅ Iplan Tunnel is ready!');
    console.log('🌐 Public URL:', tunnel.url);
    console.log('\n📋 Iplan MCP Endpoints:');
    console.log('   Health Check:', tunnel.url + '/');
    console.log('   MCP Endpoint:', tunnel.url + '/sse');
    console.log('\n🔧 Available Tools:');
    console.log('   - search_plans: חיפוש תכניות במינהל התכנון');
    console.log('   - get_plan_details: פרטי תכנית ספציפית');
    console.log('   - search_by_location: חיפוש לפי מיקום');
    console.log('   - get_building_restrictions: הגבלות בנייה');
    console.log('   - get_infrastructure_data: נתוני תשתיות');
    console.log('   - get_conservation_sites: אתרי שימור');
    console.log('\n🔗 Use this URL for Claude AI connection:');
    console.log('   ', tunnel.url);
    console.log('\n⚠️  Keep this process running to maintain the tunnel!');
    console.log('    Press Ctrl+C to stop');

    tunnel.on('close', () => {
      console.log('\n❌ Iplan Tunnel closed');
    });

    // Keep the process alive
    process.on('SIGINT', () => {
      console.log('\n🛑 Stopping Iplan tunnel...');
      tunnel.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Error starting Iplan tunnel:', error.message);
  }
}

startIplanTunnel();