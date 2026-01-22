# Manual UI Testing Guide
## Web Dashboard for API Key Management

**Task:** 5.3 - Manual UI Testing
**Date:** 2026-01-22
**Dashboard URL:** http://localhost:3001
**Authentication:** Optional (configure via .env)

---

## Test Environment Setup

### Prerequisites
1. Bun runtime installed
2. Dashboard dependencies installed: `bun install`
3. Test data available in `data/apikeys.json`

### Starting the Dashboard
```bash
# With hot-reload for development
bun run dashboard

# Or without hot-reload
bun start index.ts
```

### Test Data
The dashboard should have test API keys loaded from `data/apikeys.json`:
- pk_test (Test Key)
- test-key-1769058577714-foji3leax (WebSocket Test Key)
- test-key-1769058582720-cw4vz5rsb (Full Fields Test)
- test-key-1769058587721-gj33tawpj (Updated Name)

---

## Test Categories

### 1. Authentication Flow

#### 1.1 Login - Bearer Token Authentication
**Preconditions:** `.env` file configured with `DASHBOARD_AUTH_TOKEN`

**Steps:**
1. Navigate to http://localhost:3001
2. Verify login page is displayed
3. Select "Bearer Token" tab
4. Enter valid bearer token
5. Click "Login" button
6. Verify redirect to dashboard

**Expected Results:**
- Login page displays with centered card design
- Bearer token input field accepts token
- Login button is enabled
- On successful login, user is redirected to dashboard
- Token is stored in sessionStorage

#### 1.2 Login - Basic Authentication
**Preconditions:** `.env` file configured with `DASHBOARD_AUTH_USERNAME` and `DASHBOARD_AUTH_PASSWORD`

**Steps:**
1. Navigate to http://localhost:3001
2. Verify login page is displayed
3. Select "Basic Auth" tab
4. Enter valid username and password
5. Click "Login" button
6. Verify redirect to dashboard

**Expected Results:**
- Basic auth form displays username and password fields
- Password visibility toggle works
- Login button is enabled
- On successful login, user is redirected to dashboard
- Credentials are stored in sessionStorage

#### 1.3 Invalid Authentication
**Steps:**
1. Navigate to http://localhost:3001
2. Enter invalid credentials (token or username/password)
3. Click "Login" button
4. Verify error message

**Expected Results:**
- Error message is displayed
- User remains on login page
- Error message is user-friendly

#### 1.4 Logout
**Steps:**
1. Login to dashboard
2. Click "Logout" button in header
3. Verify redirect to login page

**Expected Results:**
- Logout button is visible in header
- Clicking logout clears sessionStorage
- User is redirected to login page
- Dashboard is no longer accessible without re-authentication

---

### 2. View API Keys

#### 2.1 View All Keys
**Steps:**
1. Login to dashboard
2. View API key table
3. Verify all keys are displayed

**Expected Results:**
- Table displays all API keys from database
- Each row shows: Key ID, Name, Model, Quota, Usage, Expiry, Actions
- Table is responsive on different screen sizes
- Data is formatted correctly (dates, numbers, etc.)

#### 2.2 Key Display Fields
**Steps:**
1. Examine each column in the table
2. Verify data formatting

**Expected Results:**
- Key ID: Monospace font with background
- Name: Plain text, expired badge if expired
- Model: Badge or "Default" if not set
- Quota: Formatted with commas (e.g., "100,000")
- Usage: Progress bar with color coding
- Expiry: Formatted date/time, red if expired
- Actions: Edit and Delete buttons

#### 2.3 Usage Visualization
**Steps:**
1. View stats overview cards at top of dashboard
2. View detailed key stats by clicking focus button (📊)
3. View usage charts

**Expected Results:**
- Stats cards show: Total Keys, Active Keys, Expired Keys
- Usage progress bars with color coding (green < 70%, yellow 70-90%, red ≥ 90%)
- Top Consumer card displays highest usage key
- Top Keys by Usage chart shows top 10 keys
- Quota Distribution by Model chart groups usage by model

---

### 3. Create API Keys

#### 3.1 Open Create Form
**Steps:**
1. Click "Create New Key" button
2. Verify create form modal opens

**Expected Results:**
- Create form modal opens with backdrop
- Form displays all required fields
- Key field is pre-filled with generated value
- Expiry date defaults to 30 days from now

#### 3.2 Create Valid API Key
**Steps:**
1. Click "Create New Key" button
2. Fill in form fields:
   - Key: (pre-filled, but can be edited)
   - Name: "Test Key Manual"
   - Model: "glm-4.7" (optional)
   - Token Limit: 50000
   - Expiry Date: (future date)
3. Click "Create" button
4. Verify key is created
5. Verify key appears in table

**Expected Results:**
- Form validation passes
- Success message or notification
- New key appears in table immediately
- Real-time update via WebSocket (if multiple clients open)
- Form closes after successful creation

#### 3.3 Create with Invalid Data - Validation Errors
**Test Cases:**

**a) Missing Required Fields**
1. Open create form
2. Leave required fields blank
3. Click "Create" button
4. Verify validation errors

**Expected Results:**
- Error messages displayed for each missing field
- Form does not submit
- User can correct errors

**b) Invalid Key Format**
1. Open create form
2. Enter key with spaces: "test key with spaces"
3. Fill other required fields
4. Click "Create" button
5. Verify validation error

**Expected Results:**
- Validation error: "Key must contain only alphanumeric characters, hyphens, and underscores"
- Form does not submit

**c) Negative Token Limit**
1. Open create form
2. Enter token limit: -1000
3. Fill other required fields
4. Click "Create" button
5. Verify validation error

**Expected Results:**
- Validation error: "Token limit must be non-negative"
- Form does not submit

**d) Past Expiry Date**
1. Open create form
2. Set expiry date to past date
3. Fill other required fields
4. Click "Create" button
5. Verify validation error

**Expected Results:**
- Validation error: "Expiry date must be in the future"
- Form does not submit

#### 3.4 Cancel Create
**Steps:**
1. Open create form
2. Fill in some fields
3. Click "Cancel" button or click outside modal
4. Verify form closes without creating key

**Expected Results:**
- Form closes
- No key is created
- Data is not saved

---

### 4. Edit API Keys

#### 4.1 Open Edit Form
**Steps:**
1. Locate an existing API key in table
2. Click "Edit" button
3. Verify edit form opens with pre-filled data

**Expected Results:**
- Edit form modal opens
- All fields are pre-filled with existing data
- Form title indicates "Edit API Key"
- Key field is disabled (cannot be changed)

#### 4.2 Edit Key Properties
**Steps:**
1. Click "Edit" button on a key
2. Modify fields:
   - Name: "Updated Test Key"
   - Token Limit: 75000
   - Expiry Date: (new future date)
   - Model: "glm-4"
3. Click "Update" button
4. Verify key is updated

**Expected Results:**
- Form validation passes
- Success message or notification
- Key data is updated in table
- Real-time update via WebSocket
- Form closes after successful update

#### 4.3 Edit with Invalid Data
**Steps:**
1. Click "Edit" button on a key
2. Enter invalid data (e.g., negative token limit)
3. Click "Update" button
4. Verify validation error

**Expected Results:**
- Validation error displayed
- Form does not submit
- Original data is preserved

#### 4.4 Cancel Edit
**Steps:**
1. Click "Edit" button on a key
2. Modify some fields
3. Click "Cancel" button or click outside modal
4. Verify form closes without saving changes

**Expected Results:**
- Form closes
- No changes are saved
- Original data is preserved

---

### 5. Delete API Keys

#### 5.1 Delete Key with Confirmation
**Steps:**
1. Locate an API key in table
2. Click "Delete" button
3. Verify confirmation dialog appears
4. Review warning message and key details
5. Click "Delete" button in dialog
6. Verify key is deleted

**Expected Results:**
- Confirmation dialog opens with safety warning
- Dialog shows key name and details
- Delete button is red/danger styled
- On confirmation, key is removed from table
- Real-time update via WebSocket
- Success message or notification

#### 5.2 Cancel Delete
**Steps:**
1. Click "Delete" button on a key
2. Click "Cancel" button in confirmation dialog
3. Verify dialog closes and key is not deleted

**Expected Results:**
- Dialog closes
- Key remains in table
- No changes are made

#### 5.3 Delete Multiple Keys
**Steps:**
1. Delete one key
2. Delete another key
3. Verify both are removed from table

**Expected Results:**
- Each deletion shows confirmation dialog
- Both keys are removed
- Table updates correctly

---

### 6. Filter and Search

#### 6.1 Search by Name
**Steps:**
1. Enter search term in search box (e.g., "Test")
2. Verify filtered results

**Expected Results:**
- Table shows only keys matching search term
- Search is case-insensitive
- Search matches both name and key fields
- Clear button appears to reset search

#### 6.2 Filter by Model
**Steps:**
1. Select model from dropdown (e.g., "glm-4")
2. Verify filtered results

**Expected Results:**
- Table shows only keys with selected model
- Dropdown shows all unique models in dataset
- Clear option to reset filter

#### 6.3 Filter by Expired Status
**Steps:**
1. Check "Show expired only" checkbox
2. Verify filtered results
3. Uncheck to show all keys

**Expected Results:**
- When checked, only expired keys are shown
- When unchecked, all keys are shown
- Checkbox state is clearly visible

#### 6.4 Combined Filters
**Steps:**
1. Enter search term
2. Select model filter
3. Check expired filter
4. Verify combined filtering works

**Expected Results:**
- All filters are applied together
- Results match all filter criteria
- Filter indicators show active filters

---

### 7. Sort Functionality

#### 7.1 Sort by Name
**Steps:**
1. Click "Name" column header
2. Verify sort order (ascending)
3. Click "Name" column header again
4. Verify sort order (descending)

**Expected Results:**
- First click sorts A-Z
- Second click sorts Z-A
- Sort indicator shows current direction (↑/↓)
- Sorting is applied to current filter results

#### 7.2 Sort by Other Columns
**Steps:**
1. Click different column headers (Quota, Usage, Expiry, etc.)
2. Verify sorting works for each column

**Expected Results:**
- All sortable columns work correctly
- Numeric columns sort numerically
- Date columns sort chronologically
- Text columns sort alphabetically

#### 7.3 Reset Sort
**Steps:**
1. Apply sort to a column
2. Click same column header third time
3. Verify sort is reset to default

**Expected Results:**
- Third click removes sort
- Table returns to default sort order (created_at desc)

---

### 8. Real-time Updates

#### 8.1 Real-time Create
**Steps:**
1. Open dashboard in two browser windows/tabs
2. Create new key in window 1
3. Verify key appears in window 2 without refresh

**Expected Results:**
- Key created in window 1
- Window 2 receives WebSocket event
- Key appears in window 2 table immediately
- No page refresh required

#### 8.2 Real-time Update
**Steps:**
1. Open dashboard in two browser windows/tabs
2. Edit key in window 1
3. Verify changes appear in window 2 without refresh

**Expected Results:**
- Key updated in window 1
- Window 2 receives WebSocket event
- Updated data appears in window 2 immediately

#### 8.3 Real-time Delete
**Steps:**
1. Open dashboard in two browser windows/tabs
2. Delete key in window 1
3. Verify key removed from window 2 without refresh

**Expected Results:**
- Key deleted in window 1
- Window 2 receives WebSocket event
- Key removed from window 2 table immediately

#### 8.4 Connection Status Indicator
**Steps:**
1. Observe connection status in header
2. Verify it shows "Connected" when WebSocket is active
3. Stop server and observe status change

**Expected Results:**
- Status indicator shows "Real-time updates active" when connected
- Status changes to "Reconnecting..." or "Disconnected" when server stops
- Visual indicator (green dot or similar) shows status

---

### 9. Responsive Design

#### 9.1 Desktop View (> 1024px)
**Steps:**
1. Open dashboard on desktop browser
2. Maximize window
3. Verify layout

**Expected Results:**
- Full table layout with all columns
- Stats grid shows 4 columns
- Charts display in full width
- All controls visible and accessible

#### 9.2 Tablet View (768px - 1024px)
**Steps:**
1. Resize browser to tablet width (e.g., 800px)
2. Verify layout adapts

**Expected Results:**
- Table maintains row layout
- Stats grid adjusts to 2-3 columns
- Controls stack appropriately
- All functionality remains accessible

#### 9.3 Mobile View (< 768px)
**Steps:**
1. Resize browser to mobile width (e.g., 375px)
2. Verify layout transforms

**Expected Results:**
- Table rows transform to card layout
- Each cell becomes labeled row with data-label
- Stats grid becomes single column
- Controls stack vertically
- Touch targets are minimum 44x44px
- Modals are full-screen
- All functionality remains accessible

#### 9.4 Mobile Interactions
**Steps:**
1. Test on mobile device or use browser dev tools
2. Tap buttons, links, and form controls
3. Verify touch interactions

**Expected Results:**
- Tap targets are large enough (min 44x44px)
- No hover effects on touch devices
- Active states provide visual feedback
- Touch scrolling works smoothly
- Form inputs don't trigger zoom

#### 9.5 Orientation Changes
**Steps:**
1. Test on mobile device
2. Rotate between portrait and landscape
3. Verify layout adapts

**Expected Results:**
- Layout adjusts to orientation
- No horizontal scrolling
- Content remains accessible
- Touch targets remain usable

---

### 10. Error Handling

#### 10.1 Network Errors
**Steps:**
1. Disconnect network or stop server
2. Perform action (create, edit, delete)
3. Verify error handling

**Expected Results:**
- User-friendly error message displayed
- No console errors or crashes
- App remains functional
- Retry mechanism (if implemented)

#### 10.2 Server Errors (500)
**Steps:**
1. Simulate server error (if possible)
2. Verify error handling

**Expected Results:**
- Error message displayed
- App remains stable
- User can retry action

#### 10.3 Validation Errors
**Steps:**
1. Submit invalid data in forms
2. Verify validation messages

**Expected Results:**
- Field-specific validation errors
- Clear error messages
- Form highlights problematic fields
- User can correct and resubmit

---

### 11. Accessibility

#### 11.1 Keyboard Navigation
**Steps:**
1. Navigate using Tab key
2. Verify focus order
3. Use Enter/Space to activate buttons

**Expected Results:**
- Logical tab order
- Visible focus indicators
- All interactive elements accessible via keyboard
- Modals can be closed with ESC key

#### 11.2 Screen Reader Support
**Steps:**
1. Use screen reader (if available)
2. Verify labels and announcements

**Expected Results:**
- Form fields have labels
- Buttons have accessible names
- ARIA attributes present
- State changes announced

#### 11.3 Color Contrast
**Steps:**
1. Review all text and UI elements
2. Verify color contrast ratios

**Expected Results:**
- Text meets WCAG AA contrast requirements
- Interactive elements have sufficient contrast
- Color is not the only indicator of state

---

### 12. Performance

#### 12.1 Initial Load
**Steps:**
1. Clear browser cache
2. Open dashboard
3. Measure load time

**Expected Results:**
- Page loads in reasonable time (< 3 seconds)
- Assets load efficiently
- No layout shifts

#### 12.2 Large Dataset Performance
**Steps:**
1. Add many API keys (100+)
2. Verify performance

**Expected Results:**
- Table remains responsive
- Filtering/sorting is fast
- No lag in interactions

#### 12.3 Real-time Update Performance
**Steps:**
1. Perform rapid updates (create/edit/delete)
2. Verify UI remains responsive

**Expected Results:**
- UI updates smoothly
- No freezing or lag
- All events processed

---

## Test Results Summary

### Passed Tests
[List tests that passed]

### Failed Tests
[List tests that failed with details]

### Issues Found
[List any bugs or issues discovered]

### Recommendations
[List any improvements or suggestions]

---

## Testing Checklist

Use this checklist to track testing progress:

### Authentication
- [ ] Login with bearer token
- [ ] Login with basic auth
- [ ] Invalid login attempt
- [ ] Logout functionality

### View API Keys
- [ ] View all keys
- [ ] Verify field formatting
- [ ] Usage visualization

### Create API Keys
- [ ] Create valid key
- [ ] Validation: Missing fields
- [ ] Validation: Invalid key format
- [ ] Validation: Negative quota
- [ ] Validation: Past expiry date
- [ ] Cancel create

### Edit API Keys
- [ ] Open edit form
- [ ] Edit key properties
- [ ] Validation errors
- [ ] Cancel edit

### Delete API Keys
- [ ] Delete with confirmation
- [ ] Cancel delete
- [ ] Delete multiple keys

### Filter and Search
- [ ] Search by name
- [ ] Filter by model
- [ ] Filter by expired status
- [ ] Combined filters

### Sort
- [ ] Sort by name
- [ ] Sort by other columns
- [ ] Reset sort

### Real-time Updates
- [ ] Real-time create
- [ ] Real-time update
- [ ] Real-time delete
- [ ] Connection status

### Responsive Design
- [ ] Desktop view
- [ ] Tablet view
- [ ] Mobile view
- [ ] Mobile interactions
- [ ] Orientation changes

### Error Handling
- [ ] Network errors
- [ ] Server errors
- [ ] Validation errors

### Accessibility
- [ ] Keyboard navigation
- [ ] Screen reader support
- [ ] Color contrast

### Performance
- [ ] Initial load time
- [ ] Large dataset performance
- [ ] Real-time update performance

---

## Notes

Add any additional notes or observations during testing:
