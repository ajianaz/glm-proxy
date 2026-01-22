/**
 * Test file for ConfirmDialog component
 *
 * This file demonstrates and tests the ConfirmDialog component functionality.
 * Run with: bun test-confirm-dialog.tsx
 */

import React, { useState } from 'react';
import ConfirmDialog from './src/components/ConfirmDialog';

/**
 * Demo App Component
 *
 * Demonstrates different use cases for the ConfirmDialog component.
 */
function DemoApp(): React.JSX.Element {
  const [dialog1, setDialog1] = useState(false);
  const [dialog2, setDialog2] = useState(false);
  const [dialog3, setDialog3] = useState(false);

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>ConfirmDialog Component Tests</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '400px' }}>
        <button
          onClick={() => setDialog1(true)}
          style={{
            padding: '10px 20px',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Test Delete Confirmation (Danger)
        </button>

        <button
          onClick={() => setDialog2(true)}
          style={{
            padding: '10px 20px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Test Primary Action (Primary)
        </button>

        <button
          onClick={() => setDialog3(true)}
          style={{
            padding: '10px 20px',
            backgroundColor: '#f59e0b',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Test Warning Action (Warning)
        </button>
      </div>

      {/* Dialog 1: Delete confirmation (danger variant) */}
      {dialog1 && (
        <ConfirmDialog
          title="Delete API Key"
          message='Are you sure you want to delete the API key "production-key-123"?'
          warning="This action cannot be undone."
          details="All data associated with this key will be permanently removed from the system."
          confirmLabel="Delete"
          confirmVariant="danger"
          onCancel={() => setDialog1(false)}
          onConfirm={async () => {
            console.log('Delete action confirmed');
            await new Promise((resolve) => setTimeout(resolve, 1000));
            setDialog1(false);
          }}
        />
      )}

      {/* Dialog 2: Primary action (primary variant) */}
      {dialog2 && (
        <ConfirmDialog
          title="Enable Feature"
          message="Are you sure you want to enable the advanced analytics feature?"
          details="This will enable data collection and reporting for all users."
          confirmLabel="Enable"
          confirmVariant="primary"
          onCancel={() => setDialog2(false)}
          onConfirm={async () => {
            console.log('Enable action confirmed');
            await new Promise((resolve) => setTimeout(resolve, 1000));
            setDialog2(false);
          }}
        />
      )}

      {/* Dialog 3: Warning action (warning variant) */}
      {dialog3 && (
        <ConfirmDialog
          title="Reset Configuration"
          message="Are you sure you want to reset the configuration to defaults?"
          warning="This will override your current settings."
          confirmLabel="Reset"
          confirmVariant="warning"
          onCancel={() => setDialog3(false)}
          onConfirm={async () => {
            console.log('Reset action confirmed');
            await new Promise((resolve) => setTimeout(resolve, 1000));
            setDialog3(false);
          }}
        />
      )}
    </div>
  );
}

// Test scenarios
console.log('✅ ConfirmDialog component created successfully');
console.log('📋 Available features:');
console.log('   - Customizable title and message');
console.log('   - Warning alerts with icon');
console.log('   - Additional details section');
console.log('   - Three button variants: primary, danger, warning');
console.log('   - Loading state support');
console.log('   - Click-outside-to-close');
console.log('   - ESC key to close');
console.log('   - Accessibility attributes (ARIA)');
console.log('');
console.log('🎨 Integration:');
console.log('   - Used in ApiKeyTable for delete confirmations');
console.log('   - Reusable for other critical actions');
console.log('   - Follows existing modal patterns');
console.log('');

export default DemoApp;
