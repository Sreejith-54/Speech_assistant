# 🔍 SiGML Hand Sign Debugging Guide

## Problem
The SiGML hand signs/animations are not appearing when using the deaf mode.

## What I've Added

### 1. Debug Logging in ChatInterface

I've added comprehensive console logging to trace the SiGML flow:

- **`handleLLMResponse`**: Logs when WebSocket messages are received
  - Shows if `sigml_xml` field exists  
  - Shows the length of SiGML XML
  - Shows current `assistantMode`
  
- **Render check**: Logs every render cycle
  - Shows if `assistantMode === 'text'`
  - Shows if `sigmlXml` state has data

## How to Debug

### Step 1: Start the Application

1. **Kill all existing processes**:
   ```powershell
   Stop-Process -Name python, node -Force -ErrorAction SilentlyContinue
   ```

2. **Start backend manually** (in one terminal):
   ```powershell
   cd c:\Users\SREEJITH\hackathon\Vocalis
   .\.venv\Scripts\Activate.ps1
   python -m backend.main
   ```

3. **Start frontend** (in another terminal):
   ```powershell
   cd c:\Users\SREEJITH\hackathon\Vocalis\frontend
   npm run dev
   ```

### Step 2: Open Browser with DevTools

1. Open http://localhost:5173
2. Press **F12** to open DevTools
3. Go to **Console** tab

### Step 3: Test Deaf Mode

1. Click the **Accessibility button** (wheelchair icon)
2. Select **"Deaf / Hard of Hearing"**
3. Type a message: **"Hello, how are you?"**
4. Press Enter

### Step 4: Check Console Logs

Look for these console messages:

#### ✅ Success Indicators:

```
🎯 handleLLMResponse called: {
  hasData: true,
  hasSigmlXml: true,
  sigmlLength: 1500,  <- Should be > 1000
  assistantMode: "text",
  dataKeys: ["type", "text", "sign_tokens", "sigml_xml", ...]
}

✅ Setting SiGML XML: <?xml version="1.0" encoding="UTF-8"?><sigml><hamgestural_sign gloss="SEQUENCE">...

🔍 Render check: {
  assistantMode: "text",
  hasSigmlXml: true,
  sigmlLength: 1500
}

JASigning library loaded
JASigning avatar initialized
Playing SiGML: <?xml version="1.0" encoding="UTF-8"...
```

#### ❌ Problem Indicators:

**Problem 1: SiGML Not in WebSocket Message**
```
🎯 handleLLMResponse called: {
  hasData: true,
  hasSigmlXml: false,  <- PROBLEM
  sigmlLength: 0,       <- PROBLEM
  ...
}

❌ No SiGML XML in response  <- PROBLEM
```

**Solution**: Backend WebSocket handler not including SiGML - check backend logs

**Problem 2: Assistant Mode Not "text"**
```
🔍 Render check: {
  assistantMode: "voice",  <- PROBLEM (should be "text")
  hasSigmlXml: true,
  sigmlLength: 1500
}
```

**Solution**: Accessibility Mode not set correctly - verify you selected "Deaf" mode

**Problem 3: JASigning Library Failed to Load**
```
Failed to load JASigning library
```

**Solution**: CDN issue or network problem - check internet connection

### Step 5: Check Backend Logs

In the backend terminal, look for:

```
INFO:backend.routes.websocket:Generated SiGML XML (1548 chars) for text message response
```

If you DON'T see this:
- The SiGML generator isn't being called
- There might be a Python exception (look for ERROR logs)

### Step 6: Check Network Tab (WebSocket)

1. In DevTools, go to **Network** tab
2. Filter by **WS** (WebSocket)
3. Click on the WebSocket connection  
4. Go to **Messages** sub-tab
5. Find the `LLM_RESPONSE` message
6. **Expand it** - you should see:

```json
{
  "type": "LLM_RESPONSE",
  "text": "Hello! How can I assist you today?",
  "sign_tokens": ["HELLO", "HOW", "CAN", ...],
  "sigml_xml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><sigml>...",
  ...
}
```

If `sigml_xml` is **missing** or **null** → Backend issue
If `sigml_xml` is **present** but avatar not showing → Frontend issue

## Common Issues & Fixes

### Issue 1: Backend not generating SiGML

**Check**: Backend logs show "Error generating SiGML"

**Fix**: Test the generator directly:
```powershell
cd c:\Users\SREEJITH\hackathon\Vocalis
.\.venv\Scripts\Activate.ps1
python -c "from backend.services.sigml_generator import SiGMLGenerator; gen = SiGMLGenerator(); print(gen.tokens_to_sigml(['HELLO']))"
```

Should print XML starting with `<?xml version="1.0"...`

### Issue 2: Frontend not receiving sigml_xml

**Check**: Console shows `hasSigmlXml: false`

**Possible causes**:
- WebSocket handler not updated (check git status)
- Backend restarted without changes
- Using wrong WebSocket endpoint

**Fix**: Verify websocket.py lines 352 and 454 include:
```python
"sigml_xml": sigml_xml,
```

### Issue 3: JASigningPlayer not rendering

**Check**: Console logs stop after "Render check" - no JASigning messages

**Possible causes**:
- Conditional rendering failed (assistantMode !== 'text' or !sigmlXml)
- React render error

**Fix**: Check console for React errors, verify accessibility mode is "deaf"

### Issue 4: JASigning CDN unavailable

**Check**: Console shows "Failed to load JASigning library"

**Fix**: 
- Check internet connection
- Try alternative CDN URL in JASigningPlayer.tsx line 45:
  ```tsx
  script.src = 'https://vh.cmp.uea.ac.uk/index.php/JASigning/JASigning.js';
  ```

## Expected Behavior

When working correctly:

1. **Console**:
   - Shows all ✅ success indicators
   - No ❌ error messages
   
2. **UI**:
   - Right panel appears with "ASL Sign Language (3D)" header
   - 3D avatar loads in the panel
   - Avatar animates ASL signs matching the response text

3. **Backend logs**:
   - "Generated SiGML XML (XXXX chars) for text message response"
   - No ERROR level logs

4. **Network (WebSocket)**:
   - LLM_RESPONSE contains `sigml_xml` field with ~1000+ characters

## Quick Test Script

Test the backend directly:

```powershell
$boundary = [System.Guid]::NewGuid().ToString()
$bodyLines = @(
    "--$boundary",
    "Content-Disposition: form-data; name=`"text`"",
    "",
    "Hello world",
    "--$boundary",
    "Content-Disposition: form-data; name=`"generate_signs`"",
    "",
    "true",
    "--$boundary--"
) -join "`r`n"

$response = Invoke-WebRequest -Uri "http://localhost:8000/deaf" -Method POST -Body $bodyLines -ContentType "multipart/form-data; boundary=$boundary" -UseBasicParsing
$data = $response.Content | ConvertFrom-Json
Write-Host "Has SiGML: $($null -ne $data.sigml_xml)"
Write-Host "SiGML Length: $(if($data.sigml_xml){$data.sigml_xml.Length}else{0})"
Write-Host "First 100 chars: $($data.sigml_xml.Substring(0, [Math]::Min(100, $data.sigml_xml.Length)))"
```

## Next Steps

1. **Start app** using Step 1
2. **Open browser with DevTools** (Step 2)
3. **Test deaf mode** (Step 3)
4. **Check console logs** (Step 4)
5. **Report what you see**:
   - Which console logs appear?
   - Any errors?
   - Does the right panel appear?
   - Does the avatar load?

Share the console output and I'll help identify the exact issue!
