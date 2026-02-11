# CBrowser Chrome Extension

AI-powered browser testing with hybrid LOCAL + REMOTE automation.

## Features

### Local Tools (Chrome APIs)
- **Page Analysis** - Extract structure, forms, links, accessibility issues
- **Element Inspector** - Visual element selection with highlight overlay
- **Flow Recorder** - Record user interactions, export as NL test or TypeScript
- **Screenshot** - Capture current view
- **Session Export** - Save cookies & localStorage

### Remote Tools (MCP Server)
- **Visual Regression** - Compare screenshots with baseline
- **Bug Hunting** - AI-powered bug detection
- **Responsive Testing** - Test across mobile/tablet/desktop
- **Cross-Browser Testing** - Run in Chromium, Firefox, WebKit
- **Chaos Testing** - Test under adverse conditions
- **Flaky Test Detection** - Identify unreliable tests

## Installation

### From Source

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

### Development

Watch mode for development:
```bash
npm run dev
```

## Usage

1. Click the CBrowser icon in Chrome toolbar to open the sidepanel
2. **Quick Actions** - One-click testing operations
3. **Recorder** - Record and export test flows
4. **Inspector** - Select and analyze elements
5. **Results** - View test results and exports
6. **Settings** - Configure MCP server and preferences

### Keyboard Shortcuts

| Action | Windows/Linux | Mac |
|--------|--------------|-----|
| Toggle Recording | Ctrl+Shift+R | Cmd+Shift+R |
| Toggle Inspector | Ctrl+Shift+I | Cmd+Shift+I |
| Take Screenshot | Ctrl+Shift+S | Cmd+Shift+S |

Configure in `chrome://extensions/shortcuts`

## MCP Server

Connect to a CBrowser MCP server for advanced testing:

1. Open Settings in the sidepanel
2. Enter your MCP server URL
3. Add auth token if required
4. Test connection

Default demo server: `https://demo.cbrowser.ai`

## Architecture

```
extension/
├── src/
│   ├── manifest.json          # Chrome Extension manifest v3
│   ├── background/
│   │   └── service-worker.ts  # Message routing, MCP bridge
│   ├── content/
│   │   ├── recorder.ts        # Flow recording
│   │   └── highlighter.ts     # Element inspector overlay
│   ├── sidepanel/
│   │   ├── index.html         # Sidepanel entry
│   │   ├── app.tsx            # React app
│   │   └── components/        # UI components
│   └── shared/
│       ├── types.ts           # TypeScript interfaces
│       ├── local-tools.ts     # Chrome API wrappers
│       └── mcp-client.ts      # MCP server bridge
├── dist/                      # Built extension
└── package.json
```

## Permissions

| Permission | Purpose |
|------------|---------|
| activeTab | Access current tab for automation |
| scripting | Inject content scripts |
| debugger | Console/network monitoring |
| tabs | Tab management |
| storage | Save settings |
| cookies | Session export |
| sidePanel | Sidepanel UI |
| contextMenus | Right-click actions |

## License

MIT - See [LICENSE](../LICENSE)
