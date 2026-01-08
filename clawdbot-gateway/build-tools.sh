#!/bin/bash
set -e

# =============================================================================
# Build addon-specific tools
# =============================================================================
# This script builds tools from /opt/addon-tools and installs them to /usr/local/bin
# Supports:
#   - TypeScript (bun build)
#   - Go (go build)
#   - Pre-built binaries (just copy)
# =============================================================================

TOOLS_DIR="/opt/addon-tools"
BIN_DIR="/usr/local/bin"

if [ ! -d "$TOOLS_DIR" ]; then
    echo "No tools directory found at $TOOLS_DIR, skipping"
    exit 0
fi

echo "Building addon tools from $TOOLS_DIR..."

for tool_dir in "$TOOLS_DIR"/*; do
    [ -d "$tool_dir" ] || continue

    tool_name=$(basename "$tool_dir")
    echo "Processing tool: $tool_name"

    cd "$tool_dir"

    # Check for pre-built binary
    if [ -f "bin/$tool_name" ]; then
        echo "  Found pre-built binary"
        cp "bin/$tool_name" "$BIN_DIR/$tool_name"
        chmod +x "$BIN_DIR/$tool_name"
        continue
    fi

    # Check for Go tool (go.mod present)
    if [ -f "go.mod" ]; then
        echo "  Building Go tool..."
        if command -v go &> /dev/null; then
            go build -o "$BIN_DIR/$tool_name" .
        else
            echo "  WARNING: Go not installed, skipping $tool_name"
        fi
        continue
    fi

    # Check for TypeScript/Node tool (package.json with src/index.ts)
    if [ -f "package.json" ] && [ -f "src/index.ts" ]; then
        echo "  Installing dependencies..."
        bun install --frozen-lockfile 2>/dev/null || bun install
        echo "  Building TypeScript tool with bun..."
        bun build src/index.ts --outfile="$BIN_DIR/${tool_name}.js" --target=node --minify

        # Create wrapper script
        cat > "$BIN_DIR/$tool_name" << EOF
#!/bin/sh
exec node "$BIN_DIR/${tool_name}.js" "\$@"
EOF
        chmod +x "$BIN_DIR/$tool_name"
        continue
    fi

    # Check for simple shell script
    if [ -f "$tool_name.sh" ]; then
        echo "  Installing shell script"
        cp "$tool_name.sh" "$BIN_DIR/$tool_name"
        chmod +x "$BIN_DIR/$tool_name"
        continue
    fi

    echo "  WARNING: Unknown tool type for $tool_name, skipping"
done

# Cleanup source after building
rm -rf "$TOOLS_DIR"

echo "Tool build complete!"
