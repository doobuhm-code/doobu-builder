const db = require('./db');

async function fetchLatestLotto(drwNo) {
  try {
    const url = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${drwNo}`;
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

async function updateHotspotsFromLatestDraw(drwNo) {
  try {
    const url = `https://www.dhlottery.co.kr/store.do?method=topResult&drwNo=${drwNo}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!response.ok) return;
    const html = await response.text();

    const list = await db.hotspots.getAll();
    for (const item of list) {
      // Create a clean keyword from the name (e.g. '스파복권방' -> '스파')
      const nameKeyword = item.name.replace(/복권방|마트|가판점|행운|대박|점$/g, '').trim();
      const addressParts = item.address.split(' ');
      const cityKeyword = addressParts[1] || addressParts[0]; // e.g. '노원구'

      if (html.includes(nameKeyword) && html.includes(cityKeyword)) {
        const regex = new RegExp(`${nameKeyword}[\\s\\S]*?${cityKeyword}|${cityKeyword}[\\s\\S]*?${nameKeyword}`, 'i');
        if (regex.test(html)) {
          console.log(`🎯 [로또 수집가] 제 ${drwNo}회차에서 ${item.name} (${item.region}) 1등 당첨 감지!`);
          const newFirstWins = item.first_wins + 1;
          const secondWinsText = item.wins.split('/')[1]?.trim() || '80회 이상';
          const newWinsText = `1등 ${newFirstWins}회 / ${secondWinsText}`;

          await db.hotspots.updateWins(item.id, newWinsText, newFirstWins);
          console.log(`📈 ${item.name}의 1등 당첨 수 업데이트 완료: ${item.first_wins}회 -> ${newFirstWins}회`);
        }
      }
    }
  } catch (err) {
    console.error(`❌ [명당 자동 갱신 실패] ${err.message}`);
  }
}

async function runLottoCollector() {
  try {
    const maxNo = await db.lotto.getMaxDrwNo();
    let nextNo = maxNo + 1;
    let successCount = 0;

    while (true) {
      const data = await fetchLatestLotto(nextNo);
      if (data) {
        await db.lotto.insert(data);
        console.log(`✅ [로또 수집 완료] 제 ${nextNo}회차(${data.drwNoDate})`);
        
        // 새로운 회차를 성공적으로 수집했을 시, 해당 회차의 1등 당첨 명당 정보도 함께 대조하여 카운트 자동 증설!
        await updateHotspotsFromLatestDraw(nextNo);
        
        successCount++;
        nextNo++;
      } else {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (successCount > 0) console.log(`🎉 로또 총 ${successCount}건 수집 완료!`);
  } catch (err) {
    console.error('❌ 로또 수집 에러:', err);
  }
}

if (require.main === module) {
  // 로컬 단독 실행 시
  (async () => {
    await db.initPgTables();
    await runLottoCollector();
  })();
}

module.exports = runLottoCollector;
