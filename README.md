# Pynk Desktop

A powerful network monitoring and ping analysis desktop application built with Electron.

## Features

- **Real-time Network Monitoring**: Track host availability and response times in real-time
- **Interactive Dashboard**: Visualize network performance metrics with interactive charts
- **Host Management**: Add, edit, and manage multiple hosts with customizable ping intervals
- **Data Analysis**: View historical ping data with flexible date range filtering
- **Report Generation**: Create customizable reports with charts and statistics
- **System Tray Integration**: Run in the background with notifications for host status changes
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Technologies

- **Electron**: Cross-platform desktop application framework
- **Chart.js**: Interactive data visualization
- **HTML/CSS/JavaScript**: Frontend interface
- **Node.js**: Backend network operations

## Getting Started

### Prerequisites

- Node.js (v14+)
- npm (v6+)

### Installation

1. Clone the repository:
```
git clone https://github.com/jakubwawak/pynk_desktop.git
cd pynk_desktop
```

2. Install dependencies:
```
npm install
```

3. Start the application:
```
npm start
```

### Building for Production

To build the application for your current platform:

```
npm run build
```

The built application will be available in the `dist` directory.

## Development

```
npm run dev
```

This will start the application in development mode with hot reloading.

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

### Data Management

Pynk provides options to manage your monitoring data:
- Export/import host lists for backup or migration
- Clear ping data while preserving your host configurations

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- Charts powered by [Chart.js](https://www.chartjs.org/)
- PDF export with [jsPDF](https://github.com/parallax/jsPDF)

---
Created by Jakub Wawak 