try {
  const { createDashboardServer } = await import('../src/dashboard/server.js');
  
  try {
    const { app } = createDashboardServer();
    console.log('createDashboardServer succeeded');
    
    // Make a fake request to init router
    const express = (await import('express')).default;
    const testApp = express();
    testApp.use(app);
    
    if (app._router) {
      app._router.stack.forEach(r => {
        if (r.route) console.log(Object.keys(r.route.methods)[0].toUpperCase(), r.route.path);
      });
    } else {
      console.log('_router not initialized yet - no requests made');
    }
  } catch (e) {
    console.error('createDashboardServer() THREW:', e.message);
    console.error(e.stack.split('\n').slice(0,5).join('\n'));
  }
} catch (e) {
  console.error('Import failed:', e.message);
}
