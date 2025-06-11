class NetworkMonitor {
    constructor() {
        this.activeJobs = new Map();
        this.dataStore = new Map();
    }

    async pingHost(hostname, count = 4) {
        try {
            const result = await window.electronAPI.pingHost(hostname, count);
            return this.processPingResult(result);
        } catch (error) {
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async tracerouteHost(hostname) {
        try {
            const result = await window.electronAPI.tracerouteHost(hostname);
            return this.processTracerouteResult(result);
        } catch (error) {
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    processPingResult(rawResult) {
        // Additional processing for ping results
        const result = {
            ...rawResult,
            quality: this.calculateQuality(rawResult),
            trend: this.calculateTrend(rawResult)
        };

        this.storeResult(result);
        return result;
    }

    processTracerouteResult(rawResult) {
        // Process traceroute output to find bottlenecks
        const hops = this.parseTracerouteHops(rawResult.output);
        return {
            ...rawResult,
            hops: hops,
            bottleneck: this.findBottleneck(hops)
        };
    }

    calculateQuality(pingResult) {
        if (!pingResult.success) return 'poor';
        
        const { avgTime, packetLoss } = pingResult;
        
        if (packetLoss > 5 || avgTime > 200) return 'poor';
        if (packetLoss > 1 || avgTime > 100) return 'fair';
        if (avgTime > 50) return 'good';
        return 'excellent';
    }

    calculateTrend(pingResult) {
        // This would compare with historical data
        // Simplified implementation
        return 'stable';
    }

    parseTracerouteHops(output) {
        const lines = output.split('\n');
        const hops = [];
        
        lines.forEach(line => {
            const hopMatch = line.match(/^\s*(\d+)\s+(.+?)(\d+\.?\d*)\s*ms/);
            if (hopMatch) {
                hops.push({
                    hop: parseInt(hopMatch[1]),
                    host: hopMatch[2].trim(),
                    time: parseFloat(hopMatch[3])
                });
            }
        });
        
        return hops;
    }

    findBottleneck(hops) {
        if (hops.length < 2) return null;
        
        let maxIncrease = 0;
        let bottleneck = null;
        
        for (let i = 1; i < hops.length; i++) {
            const increase = hops[i].time - hops[i-1].time;
            if (increase > maxIncrease && increase > 50) {
                maxIncrease = increase;
                bottleneck = hops[i];
            }
        }
        
        return bottleneck;
    }

    storeResult(result) {
        const hostData = this.dataStore.get(result.host) || [];
        hostData.push(result);
        
        // Keep only last 1000 results per host
        if (hostData.length > 1000) {
            hostData.shift();
        }
        
        this.dataStore.set(result.host, hostData);
    }

    getHostData(hostname, timeRange = '24h') {
        const data = this.dataStore.get(hostname) || [];
        const cutoffTime = this.calculateCutoffTime(timeRange);
        
        return data.filter(result => 
            new Date(result.timestamp) >= cutoffTime
        );
    }

    calculateCutoffTime(timeRange) {
        const now = new Date();
        const cutoff = new Date(now);
        
        switch(timeRange) {
            case '1h': cutoff.setHours(now.getHours() - 1); break;
            case '6h': cutoff.setHours(now.getHours() - 6); break;
            case '24h': cutoff.setDate(now.getDate() - 1); break;
            case '7d': cutoff.setDate(now.getDate() - 7); break;
            case '30d': cutoff.setDate(now.getDate() - 30); break;
            default: cutoff.setDate(now.getDate() - 1);
        }
        
        return cutoff;
    }

    generateStatistics(hostname, timeRange = '24h') {
        const data = this.getHostData(hostname, timeRange);
        
        if (data.length === 0) {
            return {
                totalPings: 0,
                successRate: 0,
                avgResponseTime: 0,
                minResponseTime: 0,
                maxResponseTime: 0,
                avgPacketLoss: 0
            };
        }

        const successfulPings = data.filter(p => p.success);
        const responseTimes = successfulPings.map(p => p.avgTime);
        
        return {
            totalPings: data.length,
            successRate: (successfulPings.length / data.length) * 100,
            avgResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length || 0,
            minResponseTime: Math.min(...responseTimes) || 0,
            maxResponseTime: Math.max(...responseTimes) || 0,
            avgPacketLoss: data.reduce((sum, p) => sum + p.packetLoss, 0) / data.length
        };
    }
}

// Make NetworkMonitor available globally
window.NetworkMonitor = NetworkMonitor;