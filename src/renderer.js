const { ipcRenderer } = require('electron');

class PynkRenderer {
    constructor() {
        this.currentView = 'home';
        this.hosts = [];
        this.jobs = new Map();
        this.pingData = new Map();
        this.charts = {};
        this.tracerouteInterval = null;
        this.eventsInterval = null;
        this.homeChartUpdateInterval = null;
        
        this.initializeApp();
        this.loadData();
        this.startPeriodicUpdates();
    }

    initializeApp() {
        // Window controls
        document.getElementById('minimize-btn').addEventListener('click', () => {
            require('electron').remote.getCurrentWindow().minimize();
        });

        document.getElementById('maximize-btn').addEventListener('click', () => {
            const win = require('electron').remote.getCurrentWindow();
            win.isMaximized() ? win.unmaximize() : win.maximize();
        });

        document.getElementById('close-btn').addEventListener('click', () => {
            require('electron').remote.getCurrentWindow().close();
        });

        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchView(e.target.dataset.view);
            });
        });

        // Add host functionality
        document.getElementById('add-host-btn').addEventListener('click', () => {
            document.getElementById('add-host-modal').classList.add('active');
        });

        document.getElementById('cancel-host-btn').addEventListener('click', () => {
            document.getElementById('add-host-modal').classList.remove('active');
        });

        document.getElementById('add-host-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addHost();
        });

        // Dashboard controls
        document.getElementById('refresh-dashboard').addEventListener('click', () => {
            this.updateDashboard();
        });

        document.getElementById('time-range').addEventListener('change', () => {
            this.updateDashboard();
        });
        
        // Selected host for statistics
        document.getElementById('selected-host').addEventListener('change', () => {
            this.updatePingStatistics();
        });

        // Home view controls
        document.getElementById('home-selected-host').addEventListener('change', () => {
            this.updateHomeChart();
        });

        // Data view controls
        document.getElementById('data-selected-host').addEventListener('change', () => {
            this.updateDataTable();
        });

        document.getElementById('apply-date-filter').addEventListener('click', () => {
            this.updateDataTable();
        });

        // Initialize date inputs with default values (last 7 days)
        const today = new Date();
        const weekAgo = new Date();
        weekAgo.setDate(today.getDate() - 7);
        
        document.getElementById('date-to').valueAsDate = today;
        document.getElementById('date-from').valueAsDate = weekAgo;

        // Report controls
        document.getElementById('generate-report-btn').addEventListener('click', () => {
            this.generateReport();
        });

        document.getElementById('export-csv-btn').addEventListener('click', () => {
            // Auto-generate report first to ensure we have the latest data
            this.generateReport();
            this.exportCSV();
        });

        document.getElementById('export-pdf-btn').addEventListener('click', () => {
            // Auto-generate report first to ensure we have the latest data
            this.generateReport();
            this.exportPDF();
        });

        // Initialize charts
        this.initializeCharts();
        
        // Run initial traceroute to 8.8.8.8
        this.updateTraceroute();
    }

    switchView(viewName) {
        // Clear any active intervals before switching
        this.clearIntervals();
        
        // Update navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-view="${viewName}"]`).classList.add('active');

        // Hide all views first
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
            view.style.display = 'none';
        });
        
        // Show only the selected view
        const viewElement = document.getElementById(`${viewName}-view`);
        viewElement.classList.add('active');
        viewElement.style.display = 'flex';
        
        // Reset scroll position
        viewElement.scrollTop = 0;
        document.querySelector('.main-content').scrollTop = 0;

        this.currentView = viewName;

        // Update view-specific content
        if (viewName === 'home') {
            this.initializeHomeView();
        } else if (viewName === 'data') {
            this.initializeDataView();
        } else if (viewName === 'dashboard') {
            this.updateDashboard();
        } else if (viewName === 'reports') {
            this.updateReportsView();
        }
    }

    clearIntervals() {
        // Clear any active intervals to prevent memory leaks
        if (this.tracerouteInterval) {
            clearInterval(this.tracerouteInterval);
            this.tracerouteInterval = null;
        }
        
        if (this.eventsInterval) {
            clearInterval(this.eventsInterval);
            this.eventsInterval = null;
        }

        if (this.homeChartUpdateInterval) {
            clearInterval(this.homeChartUpdateInterval);
            this.homeChartUpdateInterval = null;
        }
    }

    addHost() {
        const hostName = document.getElementById('host-name').value.trim();
        const hostAlias = document.getElementById('host-alias').value.trim();
        const pingInterval = parseInt(document.getElementById('ping-interval').value);

        if (!hostName) return;

        const host = {
            id: Date.now().toString(),
            name: hostName,
            alias: hostAlias || hostName,
            interval: pingInterval,
            status: 'stopped',
            lastPing: null,
            avgTime: 0,
            packetLoss: 0
        };

        this.hosts.push(host);
        this.saveData();
        this.updateHostsList();
        this.startMonitoring(host);

        // Close modal and reset form
        document.getElementById('add-host-modal').classList.remove('active');
        document.getElementById('add-host-form').reset();
    }

    async startMonitoring(host) {
        if (this.jobs.has(host.id)) {
            clearInterval(this.jobs.get(host.id));
        }

        const pingHost = async () => {
            try {
                const result = await ipcRenderer.invoke('ping-host', host.name);
                this.processPingResult(host, result);
                
                // If ping failed, run traceroute
                if (!result.success || result.packetLoss > 50) {
                    const traceResult = await ipcRenderer.invoke('traceroute-host', host.name);
                    this.processTracerouteResult(host, traceResult);
                }
            } catch (error) {
                console.error('Ping error:', error);
                // Create a failure result on error
                this.processPingResult(host, {
                    timestamp: new Date().toISOString(),
                    success: false,
                    avgTime: 0,
                    packetLoss: 100,
                    minTime: 0,
                    maxTime: 0,
                    error: error.message || 'Unknown error'
                });
            }
            
            // Update dashboard if we're on that view
            if (this.currentView === 'dashboard') {
                this.updateRecentEvents();
            }
        };

        // Initial ping
        await pingHost();

        // Set up interval
        const intervalId = setInterval(pingHost, host.interval * 1000);
        this.jobs.set(host.id, intervalId);

        // Update host status
        host.status = 'running';
        this.updateHostsList();
        this.updateJobsList();
    }

    stopMonitoring(hostId) {
        if (this.jobs.has(hostId)) {
            clearInterval(this.jobs.get(hostId));
            this.jobs.delete(hostId);
        }

        const host = this.hosts.find(h => h.id === hostId);
        if (host) {
            host.status = 'stopped';
            this.updateHostsList();
            this.updateJobsList();
        }
    }

    processPingResult(host, result) {
        // Store ping data
        if (!this.pingData.has(host.id)) {
            this.pingData.set(host.id, []);
        }

        // Ensure result has all necessary fields
        const processedResult = {
            ...result,
            timestamp: result.timestamp || new Date().toISOString(),
            success: result.success !== undefined ? result.success : false,
            avgTime: result.avgTime || 0,
            packetLoss: result.packetLoss !== undefined ? result.packetLoss : 100,
            minTime: result.minTime || 0,
            maxTime: result.maxTime || 0
        };

        const data = this.pingData.get(host.id);
        data.push(processedResult);

        // Keep only last 1000 pings
        if (data.length > 1000) {
            data.shift();
        }

        // Update host statistics
        host.lastPing = processedResult.timestamp;
        host.avgTime = processedResult.avgTime;
        host.packetLoss = processedResult.packetLoss;

        if (processedResult.success && processedResult.packetLoss < 10) {
            host.status = 'running';
        } else if (processedResult.packetLoss > 50) {
            host.status = 'failed';
        } else {
            host.status = 'warning';
        }

        this.saveData();
        this.updateHostsList();
    }

    processTracerouteResult(host, result) {
        // Store traceroute data
        if (!this.pingData.has(host.id)) {
            this.pingData.set(host.id, []);
        }

        const data = this.pingData.get(host.id);
        const lastPing = data[data.length - 1];
        
        if (lastPing) {
            lastPing.traceroute = result;
        }

        this.saveData();
    }

    updateHostsList() {
        const container = document.getElementById('hosts-list');
        container.innerHTML = '';

        this.hosts.forEach(host => {
            const item = document.createElement('div');
            item.className = 'host-item';
            item.innerHTML = `
                <div class="host-name">${host.alias}</div>
                <div class="host-details">
                    ${host.name} • ${host.interval}s interval<br>
                    avg: ${host.avgTime.toFixed(1)}ms • loss: ${host.packetLoss.toFixed(1)}%
                </div>
                <div class="host-actions">
                    <button class="btn-secondary btn-small" onclick="app.toggleMonitoring('${host.id}')">
                        ${host.status === 'running' ? 'stop' : 'start'}
                    </button>
                    <button class="btn-secondary btn-small" onclick="app.removeHost('${host.id}')">remove</button>
                </div>
            `;
            container.appendChild(item);
        });
    }

    updateJobsList() {
        const container = document.getElementById('jobs-list');
        container.innerHTML = '';

        this.hosts.forEach(host => {
            const item = document.createElement('div');
            item.className = 'job-item';
            item.innerHTML = `
                <div class="host-name">${host.alias}</div>
                <div class="host-details">
                    <span class="job-status ${host.status}">${host.status}</span><br>
                    last ping: ${host.lastPing ? new Date(host.lastPing).toLocaleTimeString() : 'never'}
                </div>
            `;
            container.appendChild(item);
        });
    }

    toggleMonitoring(hostId) {
        const host = this.hosts.find(h => h.id === hostId);
        if (!host) return;

        if (host.status === 'running') {
            this.stopMonitoring(hostId);
        } else {
            this.startMonitoring(host);
        }
    }

    removeHost(hostId) {
        this.stopMonitoring(hostId);
        this.hosts = this.hosts.filter(h => h.id !== hostId);
        this.pingData.delete(hostId);
        this.saveData();
        this.updateHostsList();
        this.updateJobsList();
    }

    initializeCharts() {
        // Common chart options
        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#ffffff',
                        font: { family: 'JetBrains Mono' }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#888' },
                    grid: { color: '#333' }
                },
                y: {
                    ticks: { color: '#888' },
                    grid: { color: '#333' }
                }
            }
        };
        
        // Response times chart
        const responseCtx = document.getElementById('response-chart');
        this.charts.response = new Chart(responseCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins
                }
            }
        });

        // Packet loss chart
        const packetCtx = document.getElementById('packet-chart');
        this.charts.packet = new Chart(packetCtx, {
            type: 'doughnut',
            data: {
                labels: ['Good', 'Warning', 'Critical'],
                datasets: [{
                    data: [100, 0, 0],
                    backgroundColor: [
                        '#10B981', // Green for good (0-2%)
                        '#F59E0B', // Yellow for warning (2-5%)
                        '#EF4444'  // Red for critical (>5%)
                    ],
                    borderWidth: 0,
                    circumference: 180,
                    rotation: 270
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    },
                    title: {
                        display: false
                    }
                }
            }
        });
        
        // Create gauge needle element for packet loss chart
        const packetContainer = packetCtx.parentNode;
        const gaugeContainer = document.createElement('div');
        gaugeContainer.className = 'gauge-container';
        gaugeContainer.innerHTML = `
            <div class="gauge-value">0%</div>
            <div class="gauge-needle" style="transform: rotate(0deg);"></div>
            <div class="gauge-labels">
                <span>0%</span>
                <span>5%</span>
                <span>10%+</span>
            </div>
        `;
        packetContainer.appendChild(gaugeContainer);
        
        // Initialize the home view chart
        const homeChartCtx = document.getElementById('home-ping-chart').getContext('2d');
        this.charts.homePing = new Chart(homeChartCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Response Time (ms)',
                    data: [],
                    backgroundColor: 'rgba(139, 92, 246, 0.2)',
                    borderColor: 'rgba(139, 92, 246, 1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
                        ticks: {
                            color: '#888'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
                        ticks: {
                            color: '#888'
                        }
                    }
                },
                animation: {
                    duration: 500
                },
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: '#fff',
                            font: {
                                family: "'JetBrains Mono', monospace"
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleFont: {
                            family: "'JetBrains Mono', monospace"
                        },
                        bodyFont: {
                            family: "'JetBrains Mono', monospace"
                        },
                        callbacks: {
                            label: function(context) {
                                return `${context.parsed.y} ms`;
                            }
                        }
                    }
                }
            }
        });
    }

    initializeHomeView() {
        this.updateHomeHostSelector();
        this.updateHomeChart();
        
        // Set up interval to update the chart every minute
        this.homeChartUpdateInterval = setInterval(() => {
            this.updateHomeChart();
        }, 60000); // 60000 ms = 1 minute
    }

    updateHomeHostSelector() {
        const selector = document.getElementById('home-selected-host');
        selector.innerHTML = '<option value="" disabled selected>select_host</option>';
        
        this.hosts.forEach(host => {
            const option = document.createElement('option');
            option.value = host.id;
            option.textContent = host.alias || host.name;
            selector.appendChild(option);
        });
        
        // If we have hosts, select the first one by default
        if (this.hosts.length > 0) {
            selector.value = this.hosts[0].id;
        }
    }

    updateHomeChart() {
        const hostId = document.getElementById('home-selected-host').value;
        if (!hostId) return;
        
        const host = this.hosts.find(h => h.id === hostId);
        if (!host) return;
        
        // Get the last 60 data points (approximately 1 hour if pinging every minute)
        const pingData = this.pingData.get(hostId) || [];
        const lastSixtyData = pingData.slice(-60);
        
        // Format data for the chart
        const labels = lastSixtyData.map(p => {
            const date = new Date(p.timestamp);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        });
        
        const responseData = lastSixtyData.map(p => p.success ? p.avgTime : null);
        
        // Update chart with new data
        this.charts.homePing.data.labels = labels;
        this.charts.homePing.data.datasets[0].data = responseData;
        this.charts.homePing.data.datasets[0].label = `${host.alias || host.name} - Response Time (ms)`;
        this.charts.homePing.update();
    }

    initializeDataView() {
        this.updateDataHostSelector();
        this.updateDataTable();
    }

    updateDataHostSelector() {
        const selector = document.getElementById('data-selected-host');
        selector.innerHTML = '<option value="" disabled selected>select_host</option>';
        
        this.hosts.forEach(host => {
            const option = document.createElement('option');
            option.value = host.id;
            option.textContent = host.alias || host.name;
            selector.appendChild(option);
        });
        
        // If we have hosts, select the first one by default
        if (this.hosts.length > 0) {
            selector.value = this.hosts[0].id;
        }
    }

    updateDataTable() {
        const hostId = document.getElementById('data-selected-host').value;
        if (!hostId) return;
        
        const host = this.hosts.find(h => h.id === hostId);
        if (!host) return;
        
        // Get date range from inputs
        const dateFrom = document.getElementById('date-from').valueAsDate;
        const dateTo = document.getElementById('date-to').valueAsDate;
        
        // Set time to end of day for the to date
        if (dateTo) {
            dateTo.setHours(23, 59, 59, 999);
        }
        
        // Filter ping data by date range
        const pingData = this.pingData.get(hostId) || [];
        const filteredData = pingData.filter(p => {
            const pingDate = new Date(p.timestamp);
            return (!dateFrom || pingDate >= dateFrom) && (!dateTo || pingDate <= dateTo);
        });
        
        // Sort by timestamp, newest first
        const sortedData = [...filteredData].sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
        
        // Populate table
        const tableBody = document.querySelector('#ping-data-table tbody');
        tableBody.innerHTML = '';
        
        if (sortedData.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 6;
            cell.textContent = 'No data available for the selected period.';
            cell.style.textAlign = 'center';
            cell.style.padding = '24px';
            row.appendChild(cell);
            tableBody.appendChild(row);
            return;
        }
        
        sortedData.forEach(ping => {
            const row = document.createElement('tr');
            
            // Timestamp
            const timestampCell = document.createElement('td');
            const date = new Date(ping.timestamp);
            timestampCell.textContent = date.toLocaleString();
            row.appendChild(timestampCell);
            
            // Status
            const statusCell = document.createElement('td');
            statusCell.textContent = ping.success ? 'success' : 'failed';
            statusCell.className = ping.success ? 'status-success' : 'status-failed';
            row.appendChild(statusCell);
            
            // Response time
            const responseCell = document.createElement('td');
            responseCell.textContent = ping.success ? `${ping.avgTime.toFixed(2)} ms` : '-';
            row.appendChild(responseCell);
            
            // Min time
            const minCell = document.createElement('td');
            minCell.textContent = ping.success ? `${ping.minTime.toFixed(2)} ms` : '-';
            row.appendChild(minCell);
            
            // Max time
            const maxCell = document.createElement('td');
            maxCell.textContent = ping.success ? `${ping.maxTime.toFixed(2)} ms` : '-';
            row.appendChild(maxCell);
            
            // Packet loss
            const lossCell = document.createElement('td');
            lossCell.textContent = `${ping.packetLoss.toFixed(1)}%`;
            if (ping.packetLoss > 5) {
                lossCell.className = 'status-warning';
            } else if (ping.packetLoss > 0) {
                lossCell.className = 'status-failed';
            }
            row.appendChild(lossCell);
            
            tableBody.appendChild(row);
        });
    }

    updateDashboard() {
        // Update host selector
        this.updateHostSelector();
        
        // Update dashboard components
        this.updateHostStatus();
        this.updateRecentEvents();
        this.updateCharts();
        this.updatePingStatistics();
        
        // Clean up any existing traceroute interval
        if (this.tracerouteInterval) {
            clearInterval(this.tracerouteInterval);
            this.tracerouteInterval = null;
        }
        
        // Update traceroute immediately and then periodically
        this.updateTraceroute();
        this.tracerouteInterval = setInterval(() => {
            if (this.currentView === 'dashboard') {
                this.updateTraceroute();
            }
        }, 5 * 60 * 1000); // Every 5 minutes
        
        // Clean up any existing events interval
        if (this.eventsInterval) {
            clearInterval(this.eventsInterval);
            this.eventsInterval = null;
        }
        
        // Update recent events every 10 seconds
        this.eventsInterval = setInterval(() => {
            if (this.currentView === 'dashboard') {
                this.updateRecentEvents();
            }
        }, 10 * 1000);
    }
    
    updateHostSelector() {
        const selector = document.getElementById('selected-host');
        const currentValue = selector.value;
        
        // Clear existing options except the placeholder
        while (selector.options.length > 1) {
            selector.remove(1);
        }
        
        // Add options for each host
        this.hosts.forEach(host => {
            const option = document.createElement('option');
            option.value = host.id;
            option.textContent = host.alias;
            selector.appendChild(option);
        });
        
        // Try to restore previous selection
        if (currentValue && this.hosts.some(h => h.id === currentValue)) {
            selector.value = currentValue;
        } else if (this.hosts.length > 0) {
            selector.value = this.hosts[0].id;
        }
    }
    
    updatePingStatistics() {
        const hostId = document.getElementById('selected-host').value;
        if (!hostId) return;
        
        const data = this.pingData.get(hostId) || [];
        const timeRange = document.getElementById('time-range').value;
        const now = new Date();
        let cutoff = new Date();
        
        switch(timeRange) {
            case '1h': cutoff.setHours(now.getHours() - 1); break;
            case '6h': cutoff.setHours(now.getHours() - 6); break;
            case '24h': cutoff.setDate(now.getDate() - 1); break;
            case '7d': cutoff.setDate(now.getDate() - 7); break;
        }
        
        const filteredData = data.filter(ping => new Date(ping.timestamp) >= cutoff);
        const successfulPings = filteredData.filter(p => p.success);
        
        if (successfulPings.length === 0) {
            document.getElementById('min-ping').textContent = '--';
            document.getElementById('max-ping').textContent = '--';
            document.getElementById('avg-ping').textContent = '--';
            document.getElementById('packet-loss').textContent = '--';
            document.getElementById('success-rate').textContent = '--';
            return;
        }
        
        const times = successfulPings.map(p => p.avgTime);
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const packetLoss = filteredData.reduce((sum, p) => sum + p.packetLoss, 0) / filteredData.length;
        const successRate = (successfulPings.length / filteredData.length) * 100;
        
        document.getElementById('min-ping').textContent = `${minTime.toFixed(1)} ms`;
        document.getElementById('max-ping').textContent = `${maxTime.toFixed(1)} ms`;
        document.getElementById('avg-ping').textContent = `${avgTime.toFixed(1)} ms`;
        document.getElementById('packet-loss').textContent = `${packetLoss.toFixed(1)}%`;
        document.getElementById('success-rate').textContent = `${successRate.toFixed(1)}%`;
    }
    
    async updateTraceroute() {
        try {
            // Show loading message
            const container = document.querySelector('.traceroute-container');
            if (container) {
                container.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Running traceroute to 8.8.8.8...</div>';
            }
            
            // Run traceroute
            const result = await ipcRenderer.invoke('traceroute-host', '8.8.8.8');
            
            // Check for success
            if (result && result.output) {
                console.log('Traceroute result:', result);
                this.displayTracerouteData(result);
            } else {
                // Show error message
                if (container) {
                    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #EF4444;">Traceroute failed. Please check your network connection.</div>';
                }
                console.error('Invalid traceroute result:', result);
            }
        } catch (error) {
            // Handle errors
            console.error('Traceroute error:', error);
            const container = document.querySelector('.traceroute-container');
            if (container) {
                container.innerHTML = `<div style="text-align: center; padding: 20px; color: #EF4444;">Traceroute error: ${error.message || 'Unknown error'}</div>`;
            }
        }
    }
    
    displayTracerouteData(result) {
        const hops = this.parseTracerouteHops(result.output);
        if (hops.length === 0) {
            // Show message if no hops data
            document.querySelector('.traceroute-container').innerHTML = 
                '<div style="text-align: center; padding: 20px; color: #888;">No traceroute data available</div>';
            return;
        }
        
        // Destroy previous chart instance if it exists to prevent duplicate canvas ID error
        if (this.charts.traceroute) {
            this.charts.traceroute.destroy();
        }
        
        // Create a fresh canvas element with a unique ID
        const container = document.querySelector('.traceroute-container');
        const canvasId = 'traceroute-chart-' + Date.now();
        container.innerHTML = `<canvas id="${canvasId}"></canvas>`;
        
        // Initialize new chart with the unique canvas
        const tracerouteCtx = document.getElementById(canvasId);
        this.charts.traceroute = new Chart(tracerouteCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Response Time (ms)',
                    data: [],
                    borderColor: '#8B5CF6',
                    backgroundColor: '#8B5CF620',
                    tension: 0.2,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: '#111',
                        titleColor: '#8B5CF6',
                        bodyColor: '#fff',
                        callbacks: {
                            title: function(tooltipItems) {
                                const hop = tooltipItems[0].dataset.hopData?.[tooltipItems[0].dataIndex];
                                if (hop) {
                                    return `Hop ${hop.hop}`;
                                }
                                return `Hop ${tooltipItems[0].dataIndex + 1}`;
                            },
                            label: function(context) {
                                const hop = context.dataset.hopData?.[context.dataIndex];
                                if (hop) {
                                    return [
                                        `Host: ${hop.host}`,
                                        `Response time: ${context.raw.toFixed(2)} ms`
                                    ];
                                }
                                return `Response time: ${context.raw.toFixed(2)} ms`;
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: `Traceroute to 8.8.8.8 (${new Date().toLocaleTimeString()})`,
                        color: '#8B5CF6',
                        font: {
                            size: 14
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Hop Number',
                            color: '#888'
                        },
                        grid: {
                            color: '#333'
                        },
                        ticks: {
                            color: '#888'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Response Time (ms)',
                            color: '#888'
                        },
                        grid: {
                            color: '#333'
                        },
                        ticks: {
                            color: '#888'
                        }
                    }
                }
            }
        });
        
        // Sort hops by hop number to ensure correct order
        hops.sort((a, b) => a.hop - b.hop);
        
        // Generate simple hop number labels
        const labels = hops.map(hop => hop.hop.toString());
        
        // Response times data
        const data = hops.map(hop => hop.time);
        
        // Update chart data
        this.charts.traceroute.data.labels = labels;
        this.charts.traceroute.data.datasets[0].data = data;
        
        // Attach hop data to dataset for use in tooltips
        this.charts.traceroute.data.datasets[0].hopData = hops;
        
        // Find bottleneck if any and highlight it
        const bottleneck = this.findBottleneck(hops);
        if (bottleneck) {
            const bottleneckIndex = hops.findIndex(h => h.hop === bottleneck.hop);
            if (bottleneckIndex !== -1) {
                // Create point style array with default for all points
                const pointStyles = new Array(hops.length).fill('circle');
                const pointRadiusArray = new Array(hops.length).fill(6);
                const pointBackgroundColors = new Array(hops.length).fill('#8B5CF6');
                
                // Highlight the bottleneck point
                pointStyles[bottleneckIndex] = 'rectRot';
                pointRadiusArray[bottleneckIndex] = 8;
                pointBackgroundColors[bottleneckIndex] = '#EF4444';
                
                // Apply custom styling to highlight bottleneck
                this.charts.traceroute.data.datasets[0].pointStyle = pointStyles;
                this.charts.traceroute.data.datasets[0].pointRadius = pointRadiusArray;
                this.charts.traceroute.data.datasets[0].pointBackgroundColor = pointBackgroundColors;
            }
        } else {
            // Reset point styles if no bottleneck
            this.charts.traceroute.data.datasets[0].pointStyle = 'circle';
            this.charts.traceroute.data.datasets[0].pointRadius = 6;
            this.charts.traceroute.data.datasets[0].pointBackgroundColor = undefined;
        }
        
        // Update the chart
        this.charts.traceroute.update();
        
        // Log success message
        console.log('Traceroute chart updated successfully with', hops.length, 'hops');
    }
    
    parseTracerouteHops(output) {
        // Handle empty or invalid output
        if (!output || typeof output !== 'string') {
            console.error('Invalid traceroute output:', output);
            return [];
        }
        
        const lines = output.split('\n');
        const hopMap = new Map(); // Use a map to consolidate multiple entries for the same hop
        
        // First line often contains header info, skip it
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue; // Skip empty lines
            
            // Try to extract hop number first
            const hopNumberMatch = line.match(/^\s*(\d+)/);
            if (!hopNumberMatch) continue; // No hop number found
            
            const hopNum = parseInt(hopNumberMatch[1]);
            if (isNaN(hopNum) || hopNum <= 0) continue; // Invalid hop number
            
            // Extract timing info (look for ms patterns)
            const timeMatches = line.match(/(\d+\.?\d*)\s*ms/g);
            let responseTime = 0;
            
            if (timeMatches && timeMatches.length > 0) {
                // Average multiple time measurements if present
                const times = timeMatches.map(t => parseFloat(t));
                responseTime = times.reduce((sum, time) => sum + time, 0) / times.length;
            }
            
            // Look for hostname/IP
            let hostname = '*';
            
            // Common patterns for hostnames and IPs in traceroute output
            const ipMatch = line.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
            const hostnameMatch = line.match(/\b([a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z0-9][-a-zA-Z0-9]*)+)\b/);
            
            if (ipMatch) {
                hostname = ipMatch[0];
                
                // If we also have a hostname, include it
                if (hostnameMatch && hostnameMatch[0] !== ipMatch[0]) {
                    hostname = `${hostnameMatch[0]} (${ipMatch[0]})`;
                }
            } else if (hostnameMatch) {
                hostname = hostnameMatch[0];
            } else if (line.includes('*')) {
                // Indicate timeout/no response
                hostname = 'No response';
                responseTime = 0;
            }
            
            // Create or update hop data
            // Always store the hop even if time is 0, to ensure continuous chart
            hopMap.set(hopNum, {
                hop: hopNum,
                host: hostname,
                time: responseTime || 0
            });
        }
        
        // For debugging
        console.log('Parsed traceroute hops:', Array.from(hopMap.values()));
        
        // Convert map to array and sort by hop number
        return Array.from(hopMap.values()).sort((a, b) => a.hop - b.hop);
    }
    
    findBottleneck(hops) {
        if (hops.length < 2) return null;
        
        let maxIncrease = 0;
        let bottleneck = null;
        
        for (let i = 1; i < hops.length; i++) {
            const increase = hops[i].time - hops[i-1].time;
            if (increase > maxIncrease && increase > 20) {
                maxIncrease = increase;
                bottleneck = hops[i];
            }
        }
        
        return bottleneck;
    }

    updateHostStatus() {
        const container = document.getElementById('host-status');
        container.innerHTML = '';

        this.hosts.forEach(host => {
            const item = document.createElement('div');
            item.className = `status-item ${host.status === 'running' ? 'online' : 
                             host.status === 'failed' ? 'offline' : 'warning'}`;
            item.innerHTML = `
                <span>${host.alias}</span>
                <span>${host.avgTime.toFixed(1)}ms</span>
            `;
            container.appendChild(item);
        });
    }

    updateRecentEvents() {
        const container = document.getElementById('recent-events');
        container.innerHTML = '';

        // Check if we have any hosts
        if (this.hosts.length === 0) {
            container.innerHTML = '<div class="event-item">No hosts configured yet</div>';
            return;
        }

        const events = [];
        
        // Collect events from all hosts
        this.hosts.forEach(host => {
            const data = this.pingData.get(host.id) || [];
            
            // Ensure we're looking at actual ping data
            data.forEach(ping => {
                // Check for failure events
                if (ping && (ping.success === false || (ping.packetLoss !== undefined && ping.packetLoss > 10))) {
                    events.push({
                        time: ping.timestamp,
                        host: host.alias,
                        message: ping.success ? 
                                `high packet loss: ${ping.packetLoss.toFixed(1)}%` : 
                                'ping failed'
                    });
                }
            });
        });

        // If no events, display a message
        if (events.length === 0) {
            container.innerHTML = '<div class="event-item">No events detected</div>';
            return;
        }

        // Sort events by time (newest first)
        events.sort((a, b) => new Date(b.time) - new Date(a.time));
        
        // Display the most recent events (limit to 20)
        events.slice(0, 20).forEach(event => {
            const item = document.createElement('div');
            item.className = 'event-item';
            item.innerHTML = `
                <div class="event-time">${new Date(event.time).toLocaleString()}</div>
                <div class="event-message">${event.host}: ${event.message}</div>
            `;
            container.appendChild(item);
        });
    }

    updateCharts() {
        const timeRange = document.getElementById('time-range').value;
        const now = new Date();
        let cutoff = new Date();

        switch(timeRange) {
            case '1h': cutoff.setHours(now.getHours() - 1); break;
            case '6h': cutoff.setHours(now.getHours() - 6); break;
            case '24h': cutoff.setDate(now.getDate() - 1); break;
            case '7d': cutoff.setDate(now.getDate() - 7); break;
        }

        // Update response times chart
        const responseDatasets = [];
        const labels = [];

        this.hosts.forEach((host, index) => {
            const data = this.pingData.get(host.id) || [];
            const filteredData = data.filter(ping => 
                new Date(ping.timestamp) >= cutoff && ping.success
            );

            if (filteredData.length > 0) {
                const color = `hsl(${(index * 360 / this.hosts.length)}, 70%, 60%)`;
                responseDatasets.push({
                    label: host.alias,
                    data: filteredData.map(ping => ping.avgTime),
                    borderColor: color,
                    backgroundColor: color + '20',
                    tension: 0.4
                });

                if (labels.length === 0) {
                    filteredData.forEach((_, i) => labels.push(i + 1));
                }
            }
        });

        this.charts.response.data.labels = labels;
        this.charts.response.data.datasets = responseDatasets;
        this.charts.response.update();

        // Update packet loss gauge chart
        const hostId = document.getElementById('selected-host').value;
        if (hostId) {
            const host = this.hosts.find(h => h.id === hostId);
            if (host) {
                const data = this.pingData.get(host.id) || [];
                const timeRange = document.getElementById('time-range').value;
                const now = new Date();
                let cutoff = new Date();
                
                switch(timeRange) {
                    case '1h': cutoff.setHours(now.getHours() - 1); break;
                    case '6h': cutoff.setHours(now.getHours() - 6); break;
                    case '24h': cutoff.setDate(now.getDate() - 1); break;
                    case '7d': cutoff.setDate(now.getDate() - 7); break;
                }
                
                const filteredData = data.filter(ping => new Date(ping.timestamp) >= cutoff);
                
                if (filteredData.length > 0) {
                    // Calculate average packet loss percentage
                    const packetLoss = filteredData.reduce((sum, p) => sum + p.packetLoss, 0) / filteredData.length;
                    
                    // Update gauge display value
                    const gaugeValue = document.querySelector('.gauge-value');
                    gaugeValue.textContent = `${packetLoss.toFixed(1)}%`;
                    
                    // Determine colors and segments based on packet loss severity
                    let goodValue = 0;
                    let warningValue = 0;
                    let criticalValue = 0;
                    
                    if (packetLoss <= 2) {
                        // All good - mostly green
                        goodValue = 100 - packetLoss * 10;
                        warningValue = packetLoss * 10;
                        gaugeValue.style.color = '#10B981';
                    } else if (packetLoss <= 5) {
                        // Warning level - mix of green and yellow
                        goodValue = 100 - (packetLoss * 20);
                        warningValue = packetLoss * 20;
                        gaugeValue.style.color = '#F59E0B';
                    } else {
                        // Critical level - mostly red
                        warningValue = Math.max(0, 100 - (packetLoss - 5) * 10);
                        criticalValue = Math.min(100, (packetLoss - 5) * 10);
                        gaugeValue.style.color = '#EF4444';
                    }
                    
                    // Update chart data
                    this.charts.packet.data.datasets[0].data = [
                        Math.max(0, goodValue), 
                        Math.max(0, warningValue), 
                        Math.max(0, criticalValue)
                    ];
                    this.charts.packet.update();
                    
                    // Update needle position (0% = -90deg, 10% = 90deg)
                    const needleRotation = Math.min(90, Math.max(-90, -90 + (packetLoss * 18)));
                    const gaugeNeedle = document.querySelector('.gauge-needle');
                    gaugeNeedle.style.transform = `rotate(${needleRotation}deg)`;
                }
            }
        }
    }

    updateReportsView() {
        const hostsContainer = document.getElementById('report-hosts');
        hostsContainer.innerHTML = '';

        this.hosts.forEach(host => {
            const label = document.createElement('label');
            label.innerHTML = `
                <input type="checkbox" value="${host.id}" checked> ${host.alias}
            `;
            hostsContainer.appendChild(label);
        });
    }

    generateReport() {
        const period = document.getElementById('report-period').value;
        const selectedHosts = Array.from(document.querySelectorAll('#report-hosts input:checked'))
                                  .map(cb => cb.value);
        const includePing = document.getElementById('include-ping').checked;
        const includeTraceroute = document.getElementById('include-traceroute').checked;
        const includeCharts = document.getElementById('include-charts').checked;
        const includeEvents = document.getElementById('include-events').checked;

        let report = `<h1>network monitoring report</h1>\n`;
        report += `<p>generated: ${new Date().toLocaleString()}</p>\n`;
        report += `<p>period: ${period}</p>\n\n`;

        selectedHosts.forEach(hostId => {
            const host = this.hosts.find(h => h.id === hostId);
            if (!host) return;

            const data = this.pingData.get(hostId) || [];
            
            report += `<h2>${host.alias} (${host.name})</h2>\n`;
            
            if (includePing && data.length > 0) {
                const successfulPings = data.filter(p => p.success);
                const avgTime = successfulPings.reduce((sum, p) => sum + p.avgTime, 0) / successfulPings.length;
                const totalLoss = data.reduce((sum, p) => sum + p.packetLoss, 0) / data.length;
                
                // Get min/max times
                const times = successfulPings.map(p => p.avgTime);
                const minTime = Math.min(...times) || 0;
                const maxTime = Math.max(...times) || 0;
                
                report += `<h3>ping statistics:</h3>\n`;
                report += `<p>total pings: ${data.length}</p>\n`;
                report += `<p>successful pings: ${successfulPings.length}</p>\n`;
                report += `<p>min response time: ${minTime.toFixed(2)}ms</p>\n`;
                report += `<p>max response time: ${maxTime.toFixed(2)}ms</p>\n`;
                report += `<p>average response time: ${avgTime.toFixed(2)}ms</p>\n`;
                report += `<p>average packet loss: ${totalLoss.toFixed(2)}%</p>\n\n`;
            }
            
            if (includeTraceroute && host.name) {
                report += `<h3>recent traceroute:</h3>\n`;
                report += `<p>Running traceroute to ${host.name}...</p>\n`;
                report += `<p>For detailed traceroute results, view the traceroute visualization in the dashboard.</p>\n\n`;
            }

            if (includeEvents) {
                const failures = data.filter(p => !p.success || p.packetLoss > 10);
                if (failures.length > 0) {
                    report += `<h3>failure events:</h3>\n`;
                    failures.slice(-10).forEach(failure => {
                        report += `<p>${new Date(failure.timestamp).toLocaleString()}: ${
                            failure.success ? `high packet loss ${failure.packetLoss.toFixed(1)}%` : 'ping failed'
                        }</p>\n`;
                    });
                    report += '\n';
                }
            }
        });

        document.getElementById('report-content').innerHTML = report;
    }

    exportCSV() {
        // Get selected hosts from the report configuration
        const selectedHosts = Array.from(document.querySelectorAll('#report-hosts input:checked'))
                                  .map(cb => cb.value);
        
        // If no hosts are selected, show an alert
        if (selectedHosts.length === 0) {
            alert('Please select at least one host to export data.');
            return;
        }
        
        // Get time period from report settings
        const period = document.getElementById('report-period').value;
        const now = new Date();
        let cutoff = new Date();
        
        switch(period) {
            case '1d': cutoff.setDate(now.getDate() - 1); break;
            case '3d': cutoff.setDate(now.getDate() - 3); break;
            case '7d': cutoff.setDate(now.getDate() - 7); break;
            case '30d': cutoff.setDate(now.getDate() - 30); break;
            default: cutoff.setDate(now.getDate() - 7); // Default to a week
        }
        
        let csv = 'timestamp,host,alias,success,avg_time,packet_loss,min_time,max_time\n';
        
        // Filter by selected hosts and time period
        selectedHosts.forEach(hostId => {
            const host = this.hosts.find(h => h.id === hostId);
            if (!host) return;
            
            const data = this.pingData.get(host.id) || [];
            const filteredData = data.filter(ping => new Date(ping.timestamp) >= cutoff);
            
            filteredData.forEach(ping => {
                csv += `${ping.timestamp},${host.name},${host.alias},${ping.success},${ping.avgTime},${ping.packetLoss},${ping.minTime},${ping.maxTime}\n`;
            });
        });

        // If no data rows were added (after the header), alert the user
        if (csv.split('\n').length <= 2) {
            alert('No data available for the selected hosts and time period.');
            return;
        }

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pynk_report_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    exportPDF() {
        // Get the report content that's already been generated based on selected hosts
        const content = document.getElementById('report-content').innerHTML;
        
        // Check if report is empty or contains only the header
        if (content.trim() === '' || content.indexOf('<h2>') === -1) {
            alert('Please generate a report first or select at least one host.');
            return;
        }
        
        // Create a print window with the report content
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Pynk Report</title>
                    <style>
                        body { font-family: monospace; margin: 40px; }
                        h1, h2, h3 { color: #8B5CF6; }
                    </style>
                </head>
                <body>${content}</body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    }

    saveData() {
        const data = {
            hosts: this.hosts,
            pingData: Array.from(this.pingData.entries())
        };
        localStorage.setItem('pynk_data', JSON.stringify(data));
    }

    loadData() {
        try {
            const saved = localStorage.getItem('pynk_data');
            if (saved) {
                const data = JSON.parse(saved);
                this.hosts = data.hosts || [];
                this.pingData = new Map(data.pingData || []);
                
                // Restart monitoring for running hosts
                this.hosts.forEach(host => {
                    if (host.status === 'running') {
                        this.startMonitoring(host);
                    }
                });
                
                this.updateHostsList();
                this.updateJobsList();
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        }
    }

    startPeriodicUpdates() {
        // Update dashboard every 30 seconds
        setInterval(() => {
            if (this.currentView === 'dashboard') {
                this.updateDashboard();
            }
        }, 30000);

        // Update lists every 5 seconds
        setInterval(() => {
            if (this.currentView === 'hosts') {
                this.updateJobsList();
            }
        }, 5000);
        
        // Clean up intervals when window is closed
        window.addEventListener('beforeunload', () => {
            if (this.tracerouteInterval) {
                clearInterval(this.tracerouteInterval);
                this.tracerouteInterval = null;
            }
            
            if (this.eventsInterval) {
                clearInterval(this.eventsInterval);
                this.eventsInterval = null;
            }
        });

        // Update the home chart if we're on that view
        setInterval(() => {
            if (this.currentView === 'home') {
                this.updateHomeChart();
            }
        }, 60000); // Update every minute
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.pynkApp = new PynkRenderer();
});