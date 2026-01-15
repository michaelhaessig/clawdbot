---
name: gemini-browser
description: Control Google Gemini via browser automation. Send messages, read responses.
homepage: https://gemini.google.com/
metadata: {"clawdbot":{"emoji":"✨","skillKey":"gemini-browser","requires":{"tools":["browser"]}}}
---

# Gemini Browser Automation

Control Google Gemini (gemini.google.com) via browser automation to send messages and read responses.

## Critical: targetId Persistence

**ALWAYS pass `targetId` from snapshot responses to subsequent act calls.** Without this, refs won't work.

```
1. snapshot → returns { targetId: "ABC123", refs: {...} }
2. act (click/type) → MUST include targetId: "ABC123"
```

## Workflow: Send a Message to Gemini

### Step 1: Navigate to Gemini

```json
{
  "action": "navigate",
  "targetUrl": "https://gemini.google.com/app"
}
```

### Step 2: Take Snapshot with Stable Refs

**Always use `refs: "aria"` for stable element references.**

```json
{
  "action": "snapshot",
  "refs": "aria"
}
```

Save the `targetId` from the response - you'll need it for all subsequent calls.

### Step 3: Find the Message Input

Look for in the snapshot:
```
- textbox "Enter a prompt here" [ref=eXXX]
```

The ref (e.g., `e361`) is the message input.

### Step 4: Click and Type Message

Click the textbox first, then type:

```json
{
  "action": "act",
  "request": {
    "kind": "click",
    "ref": "e361",
    "targetId": "<targetId-from-snapshot>"
  }
}
```

```json
{
  "action": "act",
  "request": {
    "kind": "type",
    "ref": "e361",
    "text": "Your message here",
    "targetId": "<targetId-from-snapshot>"
  }
}
```

### Step 5: Find and Click Send Button

Take a new snapshot to find the send button (it appears after typing):

```json
{
  "action": "snapshot",
  "refs": "aria"
}
```

Look for:
```
- button "Send message" [ref=eXXX]
```

Click it:

```json
{
  "action": "act",
  "request": {
    "kind": "click",
    "ref": "<send-button-ref>",
    "targetId": "<targetId-from-snapshot>"
  }
}
```

### Step 6: Wait for Response

Wait for Gemini to respond (typically 3-10 seconds), then take a snapshot to read the response:

```json
{
  "action": "act",
  "request": {
    "kind": "wait",
    "timeMs": 5000,
    "targetId": "<targetId>"
  }
}
```

Then snapshot to see the response.

## Key Elements in Gemini UI

| Element | Description | Typical Ref Pattern |
|---------|-------------|---------------------|
| Message input | `textbox "Enter a prompt here"` | `e361` (varies) |
| Send button | `button "Send message"` | Appears after typing |
| New chat | `link "New chat"` | Sidebar |
| Chat history | `button "<chat-title>"` | Sidebar list |

## Common Issues

### "Unknown ref" Error

**Cause:** targetId not passed to act call, or stale refs.

**Fix:**
1. Always pass `targetId` from the most recent snapshot
2. Take a fresh snapshot if page changed
3. Use `refs: "aria"` for stable refs

### Send Button Not Found

The send button only appears after text is entered. Take a snapshot AFTER typing to find it.

### Page Navigation

After clicking send, Gemini may create a new chat URL. The targetId remains valid but refs change. Take a new snapshot after navigation.

## Complete Example

```
1. browser action=navigate targetUrl="https://gemini.google.com/app"
2. browser action=snapshot refs="aria"
   → Save targetId: "ABC123", find textbox ref: "e361"
3. browser action=act request={kind:"click", ref:"e361", targetId:"ABC123"}
4. browser action=act request={kind:"type", ref:"e361", text:"Hello Gemini", targetId:"ABC123"}
5. browser action=snapshot refs="aria"
   → Find send button ref: "e404"
6. browser action=act request={kind:"click", ref:"e404", targetId:"ABC123"}
7. Wait 5 seconds
8. browser action=snapshot refs="aria"
   → Read Gemini's response from snapshot
```

## Tips

- **Always use `refs: "aria"`** - More stable than default role refs
- **Always pass `targetId`** - Required for ref resolution
- **Fresh snapshot after navigation** - Refs change when page content changes
- **Send button appears after typing** - Don't look for it before entering text
