function doPost(e) {
  const LINE_ACCESS_TOKEN = 'Y9ANJ2HmVgKFkIMaiACWjlirF/9DbpC8Kk+meSX5nfrA4jT/8qjBrMC+39qgVkRxz81/TNVLHJBRKubUF57P83IB9ai2SNVBFRlLATDjIPNR32UhHIJRudYEINzbF17qQB1zsQKVBlFSho2+OCPO6wdB04t89/1O/w1cDnyilFU=';
  const SPREADSHEET_ID = '1wTw894bkfZz3g22p2LIOb5CxSdyezfVRy56fako0-kM';

  // リクエストを解析
  const event = JSON.parse(e.postData.contents).events[0];
  const userMessage = event.message.text;
  const replyToken = event.replyToken;
  const userId = event.source.userId;

  // 返信メッセージ
  let replyMessage = '';

  // メッセージ内容で分岐
  if (userMessage === 'マッチョ') {
    // 「マッチョ」と入力された場合
    const userName = getUserDisplayName(userId, LINE_ACCESS_TOKEN, event.source);
    const isRecorded = checkIfAlreadyRecorded(userId, SPREADSHEET_ID);

    if (isRecorded) {
      replyMessage = `${userName}さん、今日のトレーニングは既に記録済みです😢`;
    } else {
      logTraining(userId, userName, SPREADSHEET_ID);
      replyMessage = `${userName}さん、ナイスマッチョ！今日のトレーニング受付が完了しました💪`;
    }
  } else if (userMessage === 'データ') {
    // 「データ」と入力された場合：トレーニング回数ランキングを返却
    replyMessage = getWeeklyAndMonthlyAndAllRankingMessage(SPREADSHEET_ID);
  } else if (userMessage === 'コマンド'){
    // コマンド紹介メッセージ
    replyMessage =
      '以下のコマンドを使用できます👩‍💻\n' +
      '・「マッチョ」: トレーニング記録を登録\n' +
      '・「データ」: トレーニング回数ランキングを表示';
  }

  // LINEに返信
  const url = 'https://api.line.me/v2/bot/message/reply';
  const payload = JSON.stringify({
    replyToken: replyToken,
    messages: [{ type: 'text', text: replyMessage }]
  });
  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN
    },
    payload: payload
  };

  UrlFetchApp.fetch(url, options);

  return ContentService.createTextOutput(
    JSON.stringify({ success: true })
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * スプレッドシートにトレーニング情報を記録
 */
function logTraining(userId, userName, sheetId) {
  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName('打刻');
  const timestamp = new Date();
  sheet.appendRow([timestamp, userId, userName]);
}
function getUserDisplayName(userId, accessToken, source) {
  let url = '';

  if (source.type === 'group') {
    url = `https://api.line.me/v2/bot/group/${source.groupId}/member/${userId}`;
  } else if (source.type === 'room') {
    url = `https://api.line.me/v2/bot/room/${source.roomId}/member/${userId}`;
  } else {
    url = `https://api.line.me/v2/bot/profile/${userId}`;
  }

  const options = {
    method: 'get',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    muteHttpExceptions: true  // エラー時のレスポンスを取得
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      const json = JSON.parse(response.getContentText());
      return json.displayName || 'ユーザー';
    } else {
      Logger.log(`Error fetching user profile: ${response.getResponseCode()} - ${response.getContentText()}`);
      return '不明なユーザー';
    }
  } catch (error) {
    Logger.log(`Exception occurred: ${error.message}`);
    return '不明なユーザー';
  }
}


/**
 * 同じユーザーが同日に記録済みかチェック
 */
function checkIfAlreadyRecorded(userId, sheetId) {
  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName('打刻');
  const data = sheet.getDataRange().getValues();
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  for (let i = 1; i < data.length; i++) {
    const recordDate = Utilities.formatDate(new Date(data[i][0]), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (data[i][1] === userId && recordDate === today) {
      // 既に同日の記録がある
      return true;
    }
  }
  return false;
}

/**
 * 全ユーザーの累計トレーニング回数を集計して、多い順に並べて返す
 */
function getRankingMessage(sheetId) {
  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName('打刻');
  const data = sheet.getDataRange().getValues();

  // 1行目はヘッダを想定してスキップ
  // userIdをキーに、名前と回数を集計
  const userData = {};
  for (let i = 1; i < data.length; i++) {
    const timestamp = data[i][0];   // 日付
    const userId = data[i][1];
    const userName = data[i][2];
    if (!userId) continue;         // userIdが空の場合はスキップ

    if (!userData[userId]) {
      userData[userId] = { name: userName, count: 0 };
    }
    userData[userId].count++;
  }

  // オブジェクトを配列に変換し、回数の多い順にソート
  const rankingArray = Object.keys(userData).map((id) => {
    return { name: userData[id].name, count: userData[id].count };
  });
  rankingArray.sort((a, b) => b.count - a.count);

  // 番号+名前+回数 形式で結果を作成
  let message = '【トレーニング回数ランキング】\n';
  rankingArray.forEach((user, index) => {
    message += `${index + 1}. ${user.name} ${user.count}回\n`;
  });

  // ランキングが無い場合の対応
  if (rankingArray.length === 0) {
    message = 'まだトレーニングの記録がありません…';
  }

  return message;
}

/**
 * ウィークリーとマンスリーと通算の集計結果メッセージを取得します
 */
function getWeeklyAndMonthlyAndAllRankingMessage(sheetId) {
  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName('打刻');
  const data = sheet.getDataRange().getValues();

  const userData = {};
  const today = new Date();
  const weekStart = getMonday(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  for (let i = 1; i < data.length; i++) {
    const timestamp = new Date(data[i][0]);
    const userId = data[i][1];
    const userName = data[i][2];
    if (!userId) continue;

    if (!userData[userId]) {
      userData[userId] = { name: userName, weeklyCount: 0, monthlyCount: 0, totalCount: 0 };
    }

    if (timestamp >= weekStart && timestamp <= weekEnd) {
      userData[userId].weeklyCount++;
    }

    if (timestamp >= monthStart && timestamp <= monthEnd) {
      userData[userId].monthlyCount++;
    }

    // 通算ランキングのカウント
    userData[userId].totalCount++;
  }

  const weeklyRanking = getRanking(userData, 'weeklyCount');
  const monthlyRanking = getRanking(userData, 'monthlyCount');
  const totalRanking = getRanking(userData, 'totalCount');

  const weekStartFormatted = formatDateMD(weekStart);
  const weekEndFormatted = formatDateMD(weekEnd);
  const monthStartFormatted = formatDateMD(monthStart);
  const monthEndFormatted = formatDateMD(monthEnd);

  let message = `【🏋️‍♀️ ウィークリーランキング (${weekStartFormatted}-${weekEndFormatted})】\n`;
  weeklyRanking.forEach((user, index) => {
    message += `${index + 1}. ${user.name} ${user.count}回\n`;
  });

  message += `\n【🏋️‍♂️ マンスリーランキング (${monthStartFormatted}-${monthEndFormatted})】\n`;
  monthlyRanking.forEach((user, index) => {
    message += `${index + 1}. ${user.name} ${user.count}回\n`;
  });

  message += `\n【🏆 通算ランキング】\n`;
  totalRanking.forEach((user, index) => {
    message += `${index + 1}. ${user.name} ${user.count}回\n`;
  });

  if (weeklyRanking.length === 0) {
    message += '\nまだウィークリーのトレーニング記録がありません…';
  }

  if (monthlyRanking.length === 0) {
    message += '\nまだマンスリーのトレーニング記録がありません…';
  }

  if (totalRanking.length === 0) {
    message += '\nまだトレーニング記録がありません…';
  }

  return message;
}

/**
 * ユーザーデータのランキングを作成
 */
function getRanking(userData, countKey) {
  // オブジェクトを配列に変換し、回数の多い順にソート
  const rankingArray = Object.keys(userData).map((id) => {
    return { name: userData[id].name, count: userData[id][countKey] };
  });

  rankingArray.sort((a, b) => b.count - a.count);

  return rankingArray;
}

/**
 * 今日の日付からその週の月曜日を計算
 */
function getMonday(date) {
  const day = date.getDay();
  const monday = new Date(date);
  if (day !== 1) {
    monday.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  }
  return monday;
}

/**
 * 日付を M/D 形式にフォーマット (例: 1/23)
 */
function formatDateMD(date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}/${d}`;
}

