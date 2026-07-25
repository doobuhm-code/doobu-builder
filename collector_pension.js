const db = require('./db');

async function fetchPensionData(drwNo) {
  try {
    const url = `https://www.dhlottery.co.kr/common.do?method=get720Number&drwNo=${drwNo}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.returnValue === 'success' ? data : null;
  } catch (e) {
    return null;
  }
}

async function runPensionCollector() {
  try {
    const maxNo = await db.pension.getMaxDrwNo();
    let nextNo = maxNo + 1;
    let successCount = 0;

    while (true) {
      const data = await fetchPensionData(nextNo);
      if (data) {
        await db.pension.insert(data);
        console.log(`✅ [연금복권 수집 완료] 제 ${nextNo}회차(${data.drwNoDate})`);
        successCount++;
        nextNo++;
      } else {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (successCount > 0) console.log(`🎉 연금복권 총 ${successCount}건 수집 완료!`);
  } catch (err) {
    console.error('❌ 연금복권 수집 에러:', err);
  }
}

if (require.main === module) {
  // 로컬 단독 실행 시
  (async () => {
    await db.initPgTables();
    await runPensionCollector();
  })();
}

module.exports = runPensionCollector;
