/**
 * Cadence edit notifications. Paste into the TRACKER's bound Apps Script project.
 * Script Properties required: CADENCE_WEBHOOK_URL, CADENCE_WEBHOOK_SECRET.
 * Run installCadenceTriggers once, then approve Google's requested permissions.
 * Never paste this secret into a cell, public file, or frontend environment value.
 */
function installCadenceTriggers() {
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty('CADENCE_WEBHOOK_URL');
  const secret = properties.getProperty('CADENCE_WEBHOOK_SECRET');
  if (!url || !/^https:\/\//.test(url) || !secret || secret.length < 32) {
    throw new Error('Set the HTTPS webhook URL and a 32+ character secret in Script Properties first.');
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  properties.setProperty('CADENCE_SHEET_ID', sheet.getId());
  properties.deleteProperty('CADENCE_FLUSH_SCHEDULED');
  properties.deleteProperty('CADENCE_PENDING');
  properties.deleteProperty('CADENCE_RETRY_COUNT');
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (['cadenceEdited', 'cadenceChanged', 'cadenceSubmitted', 'cadenceFlush'].indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('cadenceEdited').forSpreadsheet(sheet).onEdit().create();
  ScriptApp.newTrigger('cadenceChanged').forSpreadsheet(sheet).onChange().create();
  // Also supports a Google Form linked to this workbook. No responses are transmitted.
  ScriptApp.newTrigger('cadenceSubmitted').forSpreadsheet(sheet).onFormSubmit().create();
  cadenceQueue_('', true); // Initial notification verifies the connection.
}

function cadenceEdited(event) {
  const name = event && event.range ? event.range.getSheet().getName() : '';
  // Monthly labels and schedules may change; never hardcode row positions or habits.
  if (name && !/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2}$/i.test(name)) return;
  cadenceQueue_(name, false);
}
function cadenceChanged(event) {
  // EDIT is already handled above. Structural changes refresh tab discovery too.
  if (event && event.changeType === 'EDIT') return;
  cadenceQueue_('', true);
}
function cadenceSubmitted(event) {
  cadenceQueue_(event && event.range ? event.range.getSheet().getName() : '', true);
}
function cadenceQueue_(tab, structure, delayMs) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const props = PropertiesService.getScriptProperties();
    const pending = JSON.parse(props.getProperty('CADENCE_PENDING') || '{"tabs":[],"structure":false}');
    if (tab && pending.tabs.indexOf(tab) === -1) pending.tabs.push(tab);
    pending.structure = pending.structure || structure;
    props.setProperty('CADENCE_PENDING', JSON.stringify(pending));
    if (!props.getProperty('CADENCE_FLUSH_SCHEDULED')) {
      // Batches a burst of checkbox edits. Apps Script may run this later than 15s.
      ScriptApp.newTrigger('cadenceFlush').timeBased().after(delayMs || 15000).create();
      props.setProperty('CADENCE_FLUSH_SCHEDULED', '1');
    }
  } finally { lock.releaseLock(); }
}
function cadenceFlush() {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  let pending;
  const props = PropertiesService.getScriptProperties();
  try {
    pending = JSON.parse(props.getProperty('CADENCE_PENDING') || 'null');
    props.deleteProperty('CADENCE_PENDING');
    props.deleteProperty('CADENCE_FLUSH_SCHEDULED');
    ScriptApp.getProjectTriggers().forEach(function(trigger) {
      if (trigger.getHandlerFunction() === 'cadenceFlush') ScriptApp.deleteTrigger(trigger);
    });
  } finally { lock.releaseLock(); }
  if (!pending) return;
  const payload = JSON.stringify({
    sheetId: props.getProperty('CADENCE_SHEET_ID'), timestamp: Date.now(),
    nonce: Utilities.getUuid(), tabs: pending.tabs, structure: pending.structure
  });
  const bytes = Utilities.computeHmacSha256Signature(payload, props.getProperty('CADENCE_WEBHOOK_SECRET'));
  const signature = bytes.map(function(b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
  let response;
  try {
    response = UrlFetchApp.fetch(props.getProperty('CADENCE_WEBHOOK_URL'), {
      method: 'post', contentType: 'application/json', payload: payload,
      headers: { 'X-Cadence-Signature': signature }, muteHttpExceptions: true
    });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      throw new Error('Notification returned HTTP ' + response.getResponseCode());
    }
  } catch (error) {
    // Queue one retry per minute, at most 3. The dashboard's fallback covers gaps.
    const attempts = Number(props.getProperty('CADENCE_RETRY_COUNT') || 0) + 1;
    props.setProperty('CADENCE_RETRY_COUNT', String(attempts));
    if (attempts <= 3) cadenceQueue_('', true, 60000);
    throw error;
  }
  props.deleteProperty('CADENCE_RETRY_COUNT');
}
