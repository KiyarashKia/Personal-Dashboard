/**
 * Pintelli edit notifications. Paste into the TRACKER's bound Apps Script project.
 * Script Properties required: PINTELLI_WEBHOOK_URL, PINTELLI_WEBHOOK_SECRET.
 * Run installPintelliTriggers once, then approve Google's requested permissions.
 * Never paste this secret into a cell, public file, or frontend environment value.
 */
function installPintelliTriggers() {
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty('PINTELLI_WEBHOOK_URL');
  const secret = properties.getProperty('PINTELLI_WEBHOOK_SECRET');
  if (!url || !/^https:\/\//.test(url) || !secret || secret.length < 32) {
    throw new Error('Set the HTTPS webhook URL and a 32+ character secret in Script Properties first.');
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  properties.setProperty('PINTELLI_SHEET_ID', sheet.getId());
  properties.deleteProperty('PINTELLI_FLUSH_SCHEDULED');
  properties.deleteProperty('PINTELLI_PENDING');
  properties.deleteProperty('PINTELLI_RETRY_COUNT');
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    // Also removes triggers installed under the product's former name, Cadence.
    if (['pintelliEdited', 'pintelliChanged', 'pintelliSubmitted', 'pintelliFlush',
         'cadenceEdited', 'cadenceChanged', 'cadenceSubmitted', 'cadenceFlush'].indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('pintelliEdited').forSpreadsheet(sheet).onEdit().create();
  ScriptApp.newTrigger('pintelliChanged').forSpreadsheet(sheet).onChange().create();
  // Also supports a Google Form linked to this workbook. No responses are transmitted.
  ScriptApp.newTrigger('pintelliSubmitted').forSpreadsheet(sheet).onFormSubmit().create();
  pintelliQueue_('', true); // Initial notification verifies the connection.
}

function pintelliEdited(event) {
  const name = event && event.range ? event.range.getSheet().getName() : '';
  // Monthly labels and schedules may change; never hardcode row positions or habits.
  if (name && !/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2}$/i.test(name)) return;
  pintelliQueue_(name, false);
}
function pintelliChanged(event) {
  // EDIT is already handled above. Structural changes refresh tab discovery too.
  if (event && event.changeType === 'EDIT') return;
  pintelliQueue_('', true);
}
function pintelliSubmitted(event) {
  pintelliQueue_(event && event.range ? event.range.getSheet().getName() : '', true);
}
function pintelliQueue_(tab, structure, delayMs) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const props = PropertiesService.getScriptProperties();
    const pending = JSON.parse(props.getProperty('PINTELLI_PENDING') || '{"tabs":[],"structure":false}');
    if (tab && pending.tabs.indexOf(tab) === -1) pending.tabs.push(tab);
    pending.structure = pending.structure || structure;
    props.setProperty('PINTELLI_PENDING', JSON.stringify(pending));
    if (!props.getProperty('PINTELLI_FLUSH_SCHEDULED')) {
      // Batches a burst of checkbox edits. Apps Script may run this later than 15s.
      ScriptApp.newTrigger('pintelliFlush').timeBased().after(delayMs || 15000).create();
      props.setProperty('PINTELLI_FLUSH_SCHEDULED', '1');
    }
  } finally { lock.releaseLock(); }
}
function pintelliFlush() {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  let pending;
  const props = PropertiesService.getScriptProperties();
  try {
    pending = JSON.parse(props.getProperty('PINTELLI_PENDING') || 'null');
    props.deleteProperty('PINTELLI_PENDING');
    props.deleteProperty('PINTELLI_FLUSH_SCHEDULED');
    ScriptApp.getProjectTriggers().forEach(function(trigger) {
      if (trigger.getHandlerFunction() === 'pintelliFlush') ScriptApp.deleteTrigger(trigger);
    });
  } finally { lock.releaseLock(); }
  if (!pending) return;
  const payload = JSON.stringify({
    sheetId: props.getProperty('PINTELLI_SHEET_ID'), timestamp: Date.now(),
    nonce: Utilities.getUuid(), tabs: pending.tabs, structure: pending.structure
  });
  const bytes = Utilities.computeHmacSha256Signature(payload, props.getProperty('PINTELLI_WEBHOOK_SECRET'));
  const signature = bytes.map(function(b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
  let response;
  try {
    response = UrlFetchApp.fetch(props.getProperty('PINTELLI_WEBHOOK_URL'), {
      method: 'post', contentType: 'application/json', payload: payload,
      headers: { 'X-Pintelli-Signature': signature }, muteHttpExceptions: true
    });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      throw new Error('Notification returned HTTP ' + response.getResponseCode());
    }
  } catch (error) {
    // Queue one retry per minute, at most 3. The dashboard's fallback covers gaps.
    const attempts = Number(props.getProperty('PINTELLI_RETRY_COUNT') || 0) + 1;
    props.setProperty('PINTELLI_RETRY_COUNT', String(attempts));
    if (attempts <= 3) pintelliQueue_('', true, 60000);
    throw error;
  }
  props.deleteProperty('PINTELLI_RETRY_COUNT');
}
