const db = require('./db');

async function fetchLatestLotto(drwNo) {
  try {
    const url = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${drwNo}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(3000)
    });
    if (response.ok) {
      const data = await response.json();
      if (data && data.returnValue === 'success') {
        return data;
      }
    }
  } catch (e) {
    // Fail silently and fall back to Naver
  }

  // Fallback to Naver Search Scraping
  try {
    const query = encodeURIComponent(`로또 ${drwNo}회 당첨번호`);
    const res = await fetch(`https://search.naver.com/search.naver?query=${query}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const cleanText = html.replace(/<\/?[^>]+(>|$)/g, " ");
    
    // Pattern 1: Highly general pattern (handles commas, spaces, text, dots, etc.)
    const regex1 = /(\d+)회\D+당첨\s*번호\D+(\d+)\D+(\d+)\D+(\d+)\D+(\d+)\D+(\d+)\D+(\d+)\D+보너스\D+(\d+)/i;
    let match = cleanText.match(regex1);
    
    // Pattern 2: Dot separated numbers
    if (!match) {
      const regex2 = /(\d+)회\D+당첨\s*번호\D+(\d+)\s*·\s*(\d+)\s*·\s*(\d+)\s*·\s*(\d+)\s*·\s*(\d+)\s*·\s*(\d+)\D+보너스\D+(\d+)/i;
      match = cleanText.match(regex2);
    }
    
    // Pattern 3: Literal comma-separated standard pattern
    if (!match) {
      const regex3 = /(\d+)회\s*\((\d{4}\.\d{2}\.\d{2})\s*추첨\)\s*당첨번호\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*보너스\s*(\d+)/i;
      match = cleanText.match(regex3);
    }
    
    if (match) {
      const round = parseInt(match[1]);
      if (round !== drwNo) return null;
      
      // Attempt to extract draw date from surrounding text or from match 3 if available
      let date = null;
      const dateMatch = cleanText.substring(match.index - 500, match.index + 500).match(/(\d{4})\.(\d{2})\.(\d{2})/);
      if (dateMatch) {
        date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
      } else {
        const dateMatch2 = cleanText.substring(match.index - 500, match.index + 500).match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
        if (dateMatch2) {
          const year = dateMatch2[1];
          const month = String(dateMatch2[2]).padStart(2, '0');
          const day = String(dateMatch2[3]).padStart(2, '0');
          date = `${year}-${month}-${day}`;
        }
      }
      
      // If we used Pattern 3, we have the exact indices
      const isPattern3 = match.length === 10;
      const numStartIndex = isPattern3 ? 3 : 2;
      const bonusIndex = isPattern3 ? 9 : 8;
      
      const nums = [
        parseInt(match[numStartIndex]),
        parseInt(match[numStartIndex + 1]),
        parseInt(match[numStartIndex + 2]),
        parseInt(match[numStartIndex + 3]),
        parseInt(match[numStartIndex + 4]),
        parseInt(match[numStartIndex + 5])
      ];
      const bonus = parseInt(match[bonusIndex]);
      
      // Safety Checks: Valid lotto numbers are between 1 and 45, and winning numbers must be unique.
      if (nums.some(n => n < 1 || n > 45) || bonus < 1 || bonus > 45) {
        return null;
      }
      if (new Set(nums).size !== 6) {
        return null;
      }
      
      return {
        returnValue: 'success',
        drwNo: round,
        drwNoDate: date || new Date().toISOString().split('T')[0],
        drwtNo1: nums[0],
        drwtNo2: nums[1],
        drwtNo3: nums[2],
        drwtNo4: nums[3],
        drwtNo5: nums[4],
        drwtNo6: nums[5],
        bnusNo: bonus
      };
    }
  } catch (err) {
    console.error(`❌ [네이버 크롤러 오류] 제 ${drwNo}회차:`, err.message);
  }
  return null;
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

module.exports = {
  runLottoCollector,
  updateHotspotsFromLatestDraw
};
