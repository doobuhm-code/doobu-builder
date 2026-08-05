const db = require('./db');

async function fetchPensionData(drwNo) {
  try {
    const url = `https://www.dhlottery.co.kr/common.do?method=get720Number&drwNo=${drwNo}`;
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
    const query = encodeURIComponent(`연금복권 ${drwNo}회 당첨번호`);
    const res = await fetch(`https://search.naver.com/search.naver?query=${query}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const cleanText = html.replace(/<\/?[^>]+(>|$)/g, " ");
    
    const regex = /제\s*(\d+)회.*?1등\s*당첨번호\D*(\d)조\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\D*보너스\s*당첨번호\D*각\s*조\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)/i;
    const match = cleanText.match(regex);
    if (match) {
      const round = parseInt(match[1]);
      if (round !== drwNo) return null;
      
      // Extract date around the match
      const surroundingText = cleanText.substring(match.index - 500, match.index + 500);
      let date = null;
      const m1 = surroundingText.match(/(\d{4})\.(\d{2})\.(\d{2})/);
      if (m1) {
        date = `${m1[1]}-${m1[2]}-${m1[3]}`;
      } else {
        const m2 = surroundingText.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
        if (m2) {
          const year = m2[1];
          const month = String(m2[2]).padStart(2, '0');
          const day = String(m2[3]).padStart(2, '0');
          date = `${year}-${month}-${day}`;
        }
      }
      
      const pensionBand = parseInt(match[2]);
      const nums = [
        parseInt(match[3]),
        parseInt(match[4]),
        parseInt(match[5]),
        parseInt(match[6]),
        parseInt(match[7]),
        parseInt(match[8])
      ];
      const bonusNums = [
        parseInt(match[9]),
        parseInt(match[10]),
        parseInt(match[11]),
        parseInt(match[12]),
        parseInt(match[13]),
        parseInt(match[14])
      ];
      
      // Safety Checks: Group must be 1-5, and all digits must be 0-9.
      if (pensionBand < 1 || pensionBand > 5) {
        return null;
      }
      if (nums.some(n => n < 0 || n > 9) || bonusNums.some(n => n < 0 || n > 9)) {
        return null;
      }
      
      return {
        drwNo: round,
        drwNoDate: date || new Date().toISOString().split('T')[0],
        pensionBand: pensionBand,
        drwtNo1: nums[0],
        drwtNo2: nums[1],
        drwtNo3: nums[2],
        drwtNo4: nums[3],
        drwtNo5: nums[4],
        drwtNo6: nums[5]
      };
    }
  } catch (err) {
    console.error(`❌ [네이버 크롤러 오류] 제 ${drwNo}회차:`, err.message);
  }
  return null;
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
