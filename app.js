(() => {
  'use strict';
  const KEY = 'koukouji.bites.v1';
  const MEALS = ['breakfast', 'lunch', 'dinner'];
  const NAMES = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };
  const $ = id => document.getElementById(id);
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dateObject = key => { const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d,12); };
  const shiftDay = (key, n) => { const d = dateObject(key); d.setDate(d.getDate()+n); return dayKey(d); };
  const validDate = key => typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= '2000-01-01' && key <= '2100-12-31' && dayKey(dateObject(key)) === key;
  const blankMeal = () => ({ count: 0, finished: false, updatedAt: 0 });
  let data = { version: 1, days: {} }, failedRead = false, readOnly = false, pendingImport = null;
  let selectedDate = dayKey(), page = 'counter';
  const hour = new Date().getHours();
  let meal = hour < 11 ? 'breakfast' : hour < 17 ? 'lunch' : 'dinner';
  let toastTimer;

  function validate(input) {
    if (!input || input.version !== 1 || !input.days || typeof input.days !== 'object' || Array.isArray(input.days)) throw new Error('备份格式不正确，请选择口口记导出的 JSON 文件。');
    if (Object.keys(input.days).length > 20000) throw new Error('备份记录过多，无法导入。');
    const clean = { version: 1, days: {} };
    for (const [date, row] of Object.entries(input.days)) {
      if (!validDate(date) || !row || typeof row !== 'object' || Array.isArray(row)) throw new Error('备份中有无效日期或记录。');
      const meals = {};
      for (const m of MEALS) {
        if (row[m] == null) continue;
        const v = row[m];
        if (!v || !Number.isInteger(v.count) || v.count < 0 || v.count > 9999 || typeof v.finished !== 'boolean' || !Number.isSafeInteger(v.updatedAt) || v.updatedAt < 0 || v.updatedAt > Date.now()+86400000) throw new Error('备份中的口数或修改时间不正确，未导入任何记录。');
        meals[m] = { count: v.count, finished: v.finished, updatedAt: v.updatedAt };
      }
      if (Object.keys(meals).length) clean.days[date] = meals;
    }
    return clean;
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = validate(JSON.parse(raw));
  } catch (_) { failedRead = true; readOnly = true; }

  function toast(message) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2400);
  }
  function persist() {
    if (readOnly) return false;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      $('save-warning').hidden = true;
      return true;
    } catch (_) {
      $('save-warning').textContent = '暂时无法保存记录，请先导出备份，勿关闭页面。';
      $('save-warning').hidden = false;
      return false;
    }
  }
  function current(m = meal, date = selectedDate) { return data.days[date]?.[m] || blankMeal(); }
  function total(date) { return MEALS.reduce((sum, m) => sum + current(m,date).count, 0); }
  function stamp() { return Math.max(Date.now(), current().updatedAt + 1); }
  function updateMeal(count, finished = false) {
    if (readOnly) { toast('原记录暂时无法读取，请先导出原始备份。'); return; }
    if (!Number.isInteger(count) || count < 0 || count > 9999) return;
    const updatedAt = stamp();
    if (!data.days[selectedDate]) data.days[selectedDate] = {};
    data.days[selectedDate][meal] = { count, finished, updatedAt };
    const saved = persist();
    renderCounter();
    if (!saved) toast('已暂存本次记录，请尽快导出备份。');
  }
  function shortDate(date) {
    const d = dateObject(date);
    return `${d.getMonth()+1}月${d.getDate()}日`;
  }
  function renderCounter() {
    $('record-date').value = selectedDate; $('record-date').max = dayKey(); $('record-date').min = '2000-01-01';
    $('date-label').textContent = selectedDate === dayKey() ? '今天' : shortDate(selectedDate);
    $('date-subtitle').textContent = `${selectedDate.replaceAll('-', '.')}  ${['周日','周一','周二','周三','周四','周五','周六'][dateObject(selectedDate).getDay()]}`;
    $('next-date').disabled = selectedDate >= dayKey(); $('prev-date').disabled = selectedDate <= '2000-01-01';
    for (const m of MEALS) {
      $('meal-'+m).setAttribute('aria-selected', String(m === meal));
      $('meal-'+m).setAttribute('aria-controls','page-counter');
      $('mini-'+m).replaceChildren(document.createTextNode(String(current(m).count)), Object.assign(document.createElement('span'), { textContent: '口' }));
      $('status-'+m).textContent = current(m).finished ? '已记好 ✓' : data.days[selectedDate]?.[m] ? '记录中' : '未记录';
    }
    const c = current();
    $('active-meal').textContent = NAMES[meal]+'计数'; $('count').textContent = c.count;
    $('subtract-bite').disabled = c.count === 0 || readOnly;
    $('add-bite').disabled = c.count >= 9999 || readOnly;
    $('edit-count').disabled = readOnly; $('finish-meal').disabled = c.finished || readOnly;
    $('finish-meal').textContent = c.finished ? '这餐已记好 ✓' : '这餐记好了 ✓';
    $('counter-hint').textContent = c.finished ? '这一餐记好了，需要时可以继续记' : c.count === 0 ? '准备好了，就从第一口开始' : '每吃一口，轻轻点一下';
    $('day-total').textContent = total(selectedDate);
    $('meal-progress').textContent = `${MEALS.filter(m => current(m).finished).length} / 3 餐已记好`;
  }
  function renderHistory() {
    const dates = Object.keys(data.days).sort().reverse();
    $('record-days').textContent = dates.length+' 天记录';
    $('week-chart').replaceChildren();
    const week = Array.from({length:7},(_,i) => shiftDay(dayKey(), i-6));
    const max = Math.max(1, ...week.map(total));
    for (const date of week) {
      const count = total(date), logged = !!data.days[date];
      const col = document.createElement('div'); col.className = 'chart-day'+(date===dayKey()?' today':'');
      const value = document.createElement('span'); value.className = 'chart-value'; value.textContent = logged ? count : '—';
      const bar = document.createElement('span'); bar.className = 'bar'; bar.style.height = (logged ? Math.max(3, count/max*73) : 3)+'px';
      const label = document.createElement('small'); label.textContent = date === dayKey() ? '今天' : `${dateObject(date).getMonth()+1}/${dateObject(date).getDate()}`;
      col.setAttribute('aria-label',shortDate(date)+(logged?'，'+count+'口':'，未记录')); col.append(value,bar,label); $('week-chart').append(col);
    }
    $('history-list').replaceChildren();
    if (!dates.length) {
      const box = document.createElement('div'); box.className = 'empty-state';
      box.innerHTML = '<div class="empty-icon" aria-hidden="true">◒</div><h3>从今天的第一口开始</h3><p>记录过的早餐、午餐和晚餐<br>都会好好留在这里。</p>';
      $('history-list').append(box); return;
    }
    for (const date of dates) {
      const button = document.createElement('button'); button.className = 'history-row'; button.dataset.date = date;
      const left = document.createElement('span');
      const label = document.createElement('span'); label.className = 'history-date'; label.textContent = (date === dayKey()?'今天 · ':'')+shortDate(date)+(date.slice(0,4)!==dayKey().slice(0,4)?' · '+date.slice(0,4):'');
      const sub = document.createElement('span'); sub.className = 'history-meals'; sub.textContent = MEALS.map(m => `${NAMES[m]} ${data.days[date][m] ? current(m,date).count : '—'}`).join('　');
      left.append(label,sub);
      const count = document.createElement('span'); count.className = 'history-total'; count.textContent = total(date);
      const unit = document.createElement('small'); unit.textContent = '口 ›'; count.append(unit);
      button.append(left,count); $('history-list').append(button);
    }
  }
  function renderSettings() { $('backup-count').textContent = Object.keys(data.days).length+' 天'; }
  function go(next) {
    page = next;
    for (const p of ['counter','history','settings']) $('page-'+p).hidden = p !== next;
    for (const button of document.querySelectorAll('[data-page]')) {
      if (button.dataset.page === next) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    }
    if (page === 'counter') renderCounter(); else if (page === 'history') renderHistory(); else renderSettings();
  }
  for (const button of document.querySelectorAll('[data-page]')) button.addEventListener('click',() => go(button.dataset.page));
  for (const button of document.querySelectorAll('[data-meal]')) button.addEventListener('click',() => { meal = button.dataset.meal; renderCounter(); });
  $('add-bite').addEventListener('click',() => updateMeal(current().count+1));
  $('subtract-bite').addEventListener('click',() => { if (current().count) updateMeal(current().count-1); });
  $('finish-meal').addEventListener('click',() => { updateMeal(current().count,true); if (!readOnly) toast(NAMES[meal]+'已记好'); });
  $('record-date').addEventListener('change',event => {
    const date = event.target.value;
    if (!validDate(date) || date > dayKey()) { renderCounter(); return; }
    selectedDate = date; renderCounter();
  });
  $('prev-date').addEventListener('click',() => { selectedDate=shiftDay(selectedDate,-1); renderCounter(); });
  $('next-date').addEventListener('click',() => { if (selectedDate<dayKey()) { selectedDate=shiftDay(selectedDate,1); renderCounter(); } });
  $('history-list').addEventListener('click',event => { const button = event.target.closest('[data-date]'); if (button) { selectedDate=button.dataset.date; go('counter'); } });
  $('edit-count').addEventListener('click',() => { $('edit-title').textContent = '修改'+NAMES[meal]+'口数'; $('count-input').value = current().count; $('edit-error').textContent=''; $('edit-dialog').showModal(); });
  $('cancel-edit').addEventListener('click',() => $('edit-dialog').close());
  $('edit-form').addEventListener('submit',event => {
    event.preventDefault(); const raw = $('count-input').value.trim(); const count = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isInteger(count) || count<0 || count>9999) { $('edit-error').textContent='请填写0到9999之间的整数。'; return; }
    updateMeal(count,current().finished); $('edit-dialog').close(); toast('口数已修改');
  });
  $('export-data').addEventListener('click',() => {
    let payload;
    try { payload = failedRead ? localStorage.getItem(KEY) : JSON.stringify({...data, app:'口口记',exportedAt:new Date().toISOString()},null,2); } catch (_) { toast('无法读取本机备份。'); return; }
    if (!payload) { toast('暂无可导出的记录。'); return; }
    const url = URL.createObjectURL(new Blob([payload],{type:'application/json'}));
    const link = document.createElement('a'); link.href=url; link.download=`口口记-${failedRead?'原始记录-':''}${dayKey()}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),30000);
    $('backup-status').textContent='已发起备份下载，请确认文件已保存到“文件”App或下载文件夹。';
  });
  $('import-data').addEventListener('click',() => { if (readOnly) { toast('请先导出原始记录，保留原数据以便恢复。'); return; } $('import-file').click(); });
  $('import-file').addEventListener('change',async event => {
    const file = event.target.files[0]; event.target.value=''; if (!file) return;
    if (file.size > 10*1024*1024) { toast('备份文件太大，请选择10MB以内的文件。'); return; }
    try {
      pendingImport=validate(JSON.parse(await file.text()));
      const dates=Object.keys(pendingImport.days); const meals=dates.reduce((n,d)=>n+Object.keys(pendingImport.days[d]).length,0);
      if (!dates.length) throw new Error('备份中没有三餐记录。');
      $('import-preview').textContent=`检测到 ${dates.length} 天、${meals} 餐记录。确认导入到这台设备吗？`;
      $('import-dialog').showModal();
    } catch (error) { pendingImport=null; toast(error.message.startsWith('备份')?error.message:'文件无法读取，请选择口口记导出的备份。'); }
  });
  $('cancel-import').addEventListener('click',() => { pendingImport=null; $('import-dialog').close(); });
  $('confirm-import').addEventListener('click',() => {
    if (!pendingImport) return;
    for (const [date,row] of Object.entries(pendingImport.days)) {
      if (!data.days[date]) data.days[date]={};
      for (const m of MEALS) if (row[m] && (!data.days[date][m] || row[m].updatedAt>data.days[date][m].updatedAt)) data.days[date][m]=row[m];
    }
    const saved=persist(); pendingImport=null; $('import-dialog').close(); renderSettings();
    toast(saved?'备份已合并导入':'已合并，请立即导出备份保存');
  });
  $('import-dialog').addEventListener('cancel',() => { pendingImport=null; });
  window.addEventListener('storage',event => {
    if (event.key!==KEY) return;
    try { data=event.newValue?validate(JSON.parse(event.newValue)):{version:1,days:{}}; readOnly=false; failedRead=false; $('save-warning').hidden=true; go(page); }
    catch (_) { readOnly=true; failedRead=true; $('save-warning').textContent='记录无法读取，已停止写入。请先到设置导出原始备份。'; $('save-warning').hidden=false; go(page); }
  });
  document.addEventListener('visibilitychange',() => { if (!document.hidden) go(page); });
  document.addEventListener('gesturestart',event => event.preventDefault(),{passive:false});
  if (failedRead) { $('save-warning').textContent='记录无法读取，已停止写入。请先到设置导出原始备份。'; $('save-warning').hidden=false; }
  go('counter');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { $('save-note').textContent='当前无法启用离线缓存，联网时仍可记录。'; });
})();
