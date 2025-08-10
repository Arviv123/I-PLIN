# SART Server

Server management API bridge for remote project management

## Features

- 📁 Project file management
- 🗂️ Directory structure exploration
- ⚡ Terminal command execution  
- 📦 ZIP file upload and extraction
- 🔄 Process management and monitoring

## Installation

```bash
npm install
npm start
```

Server runs on port 3001 (or PORT environment variable)

## API Endpoints

### Health Check
- `GET /` - Server status and info

### Project Management
- `POST /upload-project` - Upload and extract ZIP project
- `GET /project/:id/structure` - Get project directory structure
- `GET /project/:id/file/*` - Read project file content
- `PUT /project/:id/file/*` - Update project file content

### Command Execution
- `POST /project/:id/run` - Execute command in project directory
- `POST /execution/:id/stop` - Stop running command
- `GET /processes` - List running processes