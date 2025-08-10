const express = require('express');
const { exec, spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const multer = require('multer');
const AdmZip = require('adm-zip');

const app = express();
const port = process.env.PORT || 3001;

// Enable CORS for all routes
app.use(cors());

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Store for running processes
const runningProcesses = new Map();

// Helper function to generate unique IDs
function generateId() {
    return crypto.randomBytes(16).toString('hex');
}

// Helper function to clean up process
function cleanupProcess(id) {
    if (runningProcesses.has(id)) {
        const process = runningProcesses.get(id);
        if (process && !process.killed) {
            process.kill();
        }
        runningProcesses.delete(id);
    }
}

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'running', 
        server: 'SART Server',
        version: '1.0.0',
        message: 'Server management API is running'
    });
});

// Endpoint to upload and extract project files
app.post('/upload-project', upload.single('project'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const projectId = generateId();
        const projectPath = path.join(__dirname, 'projects', projectId);
        
        // Create project directory
        await fs.mkdir(projectPath, { recursive: true });

        // Extract uploaded zip file
        const zip = new AdmZip(req.file.buffer);
        zip.extractAllTo(projectPath, true);

        res.json({ projectId, message: 'Project uploaded and extracted successfully' });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload and extract project' });
    }
});

// Endpoint to get project structure
app.get('/project/:id/structure', async (req, res) => {
    try {
        const projectPath = path.join(__dirname, 'projects', req.params.id);
        
        async function getDirectoryStructure(dirPath, relativePath = '') {
            const items = await fs.readdir(dirPath);
            const structure = [];

            for (const item of items) {
                const itemPath = path.join(dirPath, item);
                const stats = await fs.stat(itemPath);
                const relativeItemPath = path.join(relativePath, item);

                if (stats.isDirectory()) {
                    structure.push({
                        name: item,
                        type: 'directory',
                        path: relativeItemPath,
                        children: await getDirectoryStructure(itemPath, relativeItemPath)
                    });
                } else {
                    structure.push({
                        name: item,
                        type: 'file',
                        path: relativeItemPath
                    });
                }
            }

            return structure;
        }

        const structure = await getDirectoryStructure(projectPath);
        res.json({ structure });
    } catch (error) {
        console.error('Structure error:', error);
        res.status(500).json({ error: 'Failed to get project structure' });
    }
});

// Endpoint to get file content
app.get('/project/:id/file/*', async (req, res) => {
    try {
        const filePath = req.params[0];
        const fullPath = path.join(__dirname, 'projects', req.params.id, filePath);
        
        // Security check - ensure the path is within the project directory
        const projectPath = path.join(__dirname, 'projects', req.params.id);
        if (!fullPath.startsWith(projectPath)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const content = await fs.readFile(fullPath, 'utf8');
        res.json({ content });
    } catch (error) {
        console.error('File read error:', error);
        res.status(500).json({ error: 'Failed to read file' });
    }
});

// Endpoint to update file content
app.put('/project/:id/file/*', async (req, res) => {
    try {
        const filePath = req.params[0];
        const fullPath = path.join(__dirname, 'projects', req.params.id, filePath);
        const { content } = req.body;
        
        // Security check
        const projectPath = path.join(__dirname, 'projects', req.params.id);
        if (!fullPath.startsWith(projectPath)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await fs.writeFile(fullPath, content, 'utf8');
        res.json({ message: 'File updated successfully' });
    } catch (error) {
        console.error('File write error:', error);
        res.status(500).json({ error: 'Failed to update file' });
    }
});

// Endpoint to run commands
app.post('/project/:id/run', async (req, res) => {
    try {
        const { command } = req.body;
        const projectPath = path.join(__dirname, 'projects', req.params.id);
        
        const executionId = generateId();
        
        res.json({ executionId, message: 'Command started' });

        // Execute command in project directory
        const process = spawn('cmd', ['/c', command], {
            cwd: projectPath,
            stdio: 'pipe'
        });

        // Store process reference
        runningProcesses.set(executionId, process);

        let output = '';
        let errorOutput = '';

        process.stdout.on('data', (data) => {
            output += data.toString();
        });

        process.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        process.on('close', (code) => {
            cleanupProcess(executionId);
            // You might want to store this output somewhere for retrieval
            console.log(`Process ${executionId} finished with code ${code}`);
            console.log('Output:', output);
            console.log('Error:', errorOutput);
        });

        // Auto cleanup after 5 minutes
        setTimeout(() => {
            cleanupProcess(executionId);
        }, 300000);

    } catch (error) {
        console.error('Run error:', error);
        res.status(500).json({ error: 'Failed to run command' });
    }
});

// Endpoint to stop a running command
app.post('/execution/:id/stop', (req, res) => {
    try {
        const executionId = req.params.id;
        cleanupProcess(executionId);
        res.json({ message: 'Process stopped' });
    } catch (error) {
        console.error('Stop error:', error);
        res.status(500).json({ error: 'Failed to stop process' });
    }
});

// Endpoint to get running processes
app.get('/processes', (req, res) => {
    const processes = Array.from(runningProcesses.keys()).map(id => ({
        id,
        status: runningProcesses.get(id).killed ? 'stopped' : 'running'
    }));
    res.json({ processes });
});

// Clean up on server shutdown
process.on('SIGTERM', () => {
    runningProcesses.forEach((proc, id) => {
        cleanupProcess(id);
    });
});

process.on('SIGINT', () => {
    runningProcesses.forEach((proc, id) => {
        cleanupProcess(id);
    });
    process.exit(0);
});

app.listen(port, '0.0.0.0', () => {
    console.log(`SART Server running on port ${port}`);
    console.log(`Health check: http://localhost:${port}/`);
});