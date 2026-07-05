// Full-stack integration test: starts backend + serves frontend, exercises the
// REAL endpoints the frontend calls, verifying HTML/JSON responses and the
// end-to-end workflow. Also runs targeted Phase-4 audit checks.
const { execSync, spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000/api';
let cookie = '';
function jar(setCookieHeader) {
  if (!setCookieHeader return; 
}

