# Pynk Desktop

Pynk Desktop is a modern network monitoring and ping analysis application built with Electron. It provides real-time network diagnostics, ping statistics, and route analysis in a sleek, user-friendly interface.

## Features

- **Network Monitoring**: Run continuous ping monitoring against multiple hosts with configurable intervals
- **Route Analysis**: Visualize network routes with traceroute to identify bottlenecks
- **Real-time Dashboard**: View live ping statistics and network quality metrics
- **Historical Data**: Store and analyze network performance over time
- **Data Visualization**: Interactive charts for response times and packet loss
- **Reports**: Generate and export detailed network performance reports
- **System Tray Integration**: Run in the background with easy access from the system tray

## Technologies

- **Electron**: Cross-platform desktop application framework
- **Chart.js**: Interactive data visualization
- **HTML/CSS/JavaScript**: Frontend interface
- **Node.js**: Backend network operations

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm (v6 or later)

### Installation

1. Clone the repository
   ```
   git clone https://github.com/yourusername/pynk_desktop.git
   cd pynk_desktop
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Start the application
   ```
   npm start
   ```

### Development

To run the application in development mode:
```
npm run dev
```

### Building for Distribution

To build the application for distribution:
```
npm run build
```

## Application Architecture

Pynk Desktop follows a simple Electron architecture:

- **main.js**: Main process handling the application lifecycle, window management, and IPC
- **network-monitor.js**: Core network monitoring functionality
- **renderer.js**: UI logic and event handling
- **index.html**: Application UI structure
- **styles.css**: Application styling

## Key Features Explained

### Ping Monitoring

Pynk allows you to monitor multiple hosts with customizable ping intervals. The application tracks response times, packet loss, and overall network quality.

### Network Route Analysis

The traceroute feature helps identify network bottlenecks by analyzing the path between your computer and the target host.

### Data Visualization

Interactive charts display real-time and historical network performance data, making it easy to identify trends and issues.

### System Tray Integration

Pynk runs in the background with a system tray icon for quick access and minimal resource usage.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 