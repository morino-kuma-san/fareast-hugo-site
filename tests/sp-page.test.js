/**
 * /sp ページ（一次判定専用フォーム）のテスト
 * Phase1 要件に基づくテスト駆動開発
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// 生成されたHTMLファイルのパス
const SP_PAGE_PATH = path.join(__dirname, '../public/sp/index.html');

describe('/sp ページ生成テスト', () => {
  let $;
  let htmlContent;

  beforeAll(() => {
    // Hugoビルド後のHTMLを読み込む
    if (!fs.existsSync(SP_PAGE_PATH)) {
      throw new Error(`/sp/index.html が生成されていません: ${SP_PAGE_PATH}`);
    }
    htmlContent = fs.readFileSync(SP_PAGE_PATH, 'utf-8');
    $ = cheerio.load(htmlContent);
  });

  describe('1. ページ生成', () => {
    test('/sp/index.html が生成されていること', () => {
      expect(fs.existsSync(SP_PAGE_PATH)).toBe(true);
    });

    test('HTMLが空でないこと', () => {
      expect(htmlContent.length).toBeGreaterThan(0);
    });
  });

  describe('2. ファーストビュー（集客用コピー）', () => {
    test('メインキャッチコピーが含まれること', () => {
      const text = $('body').text();
      expect(text).toMatch(/その商標/);
      expect(text).toMatch(/出願してから後悔/);
    });

    test('弁理士×弁護士のダブルチェックが言及されていること', () => {
      const text = $('body').text();
      expect(text).toMatch(/弁理士.*弁護士/);
      expect(text).toMatch(/ダブルチェック/);
    });

    test('失敗回避のメッセージがあること', () => {
      const text = $('body').text();
      expect(text).toMatch(/失敗.*避/);
    });
  });

  describe('3. 一次判定の射程（分かること／分からないこと）', () => {
    test('「分かること」セクションがあること', () => {
      const text = $('body').text();
      expect(text).toMatch(/分かること/);
    });

    test('「分からないこと」セクションがあること', () => {
      const text = $('body').text();
      expect(text).toMatch(/分からないこと/);
    });

    test('先行商標の確認について言及があること', () => {
      const text = $('body').text();
      expect(text).toMatch(/先行商標/);
    });

    test('最終的な登録可否の断定はしない旨の記載があること', () => {
      const text = $('body').text();
      expect(text).toMatch(/登録可否.*断定/);
    });
  });

  describe('4. フォーム直前：「入力が軽い理由」説明文', () => {
    test('一次判定専用フォームであることの説明があること', () => {
      const text = $('body').text();
      expect(text).toMatch(/一次判定専用フォーム/);
    });

    test('簡易判定では詳細情報が不要な理由の説明があること', () => {
      const text = $('body').text();
      expect(text).toMatch(/簡易判定では不要/);
    });
  });

  describe('5. 入力フォーム（必須項目）', () => {
    test('フォーム要素が存在すること', () => {
      expect($('form').length).toBeGreaterThan(0);
    });

    test('商標（文字）入力欄があること', () => {
      const hasTrademarkField =
        $('input[name*="trademark"], input[name*="商標"], textarea[name*="trademark"], textarea[name*="商標"]').length > 0 ||
        $('label').text().includes('商標');
      expect(hasTrademarkField).toBe(true);
    });

    test('商品・サービス入力欄があること', () => {
      const hasServiceField =
        $('input[name*="service"], input[name*="商品"], textarea[name*="service"], textarea[name*="商品"]').length > 0 ||
        $('label').text().includes('商品') || $('label').text().includes('サービス');
      expect(hasServiceField).toBe(true);
    });

    test('メールアドレス入力欄があること', () => {
      const hasEmailField =
        $('input[type="email"], input[name*="email"], input[name*="メール"]').length > 0;
      expect(hasEmailField).toBe(true);
    });

    test('メールアドレス確認入力欄があること', () => {
      const emailFields = $('input[type="email"], input[name*="email"], input[name*="メール"]');
      // 2つ以上のメール入力欄があるか、確認用の入力欄がある
      const hasConfirmField = emailFields.length >= 2 ||
        $('input[name*="confirm"], input[name*="確認"]').length > 0 ||
        $('label').text().includes('確認');
      expect(hasConfirmField).toBe(true);
    });

    test('送信ボタンがあること', () => {
      const hasSubmitButton =
        $('button[type="submit"], input[type="submit"]').length > 0 ||
        $('button').text().includes('送信');
      expect(hasSubmitButton).toBe(true);
    });
  });

  describe('6. 任意入力項目', () => {
    test('予備メール入力欄があること（任意）', () => {
      const text = $('body').text();
      expect(text).toMatch(/予備.*メール|サブ.*メール/);
    });

    test('ロゴの有無選択があること（任意）', () => {
      const text = $('body').text();
      expect(text).toMatch(/ロゴ/);
    });

    test('使用状況選択があること（任意）', () => {
      const text = $('body').text();
      expect(text).toMatch(/使用状況|使用中|予定/);
    });
  });

  describe('7. 免責・注意文（送信ボタン直下）', () => {
    test('簡易的な一次判定であることの免責があること', () => {
      const text = $('body').text();
      expect(text).toMatch(/簡易的な一次判定/);
    });

    test('登録可否の保証はしない旨の記載があること', () => {
      const text = $('body').text();
      expect(text).toMatch(/保証.*ではありません|保証するものではありません/);
    });

    test('無料精査（B）への案内があること', () => {
      const text = $('body').text();
      expect(text).toMatch(/無料精査/);
    });
  });

  describe('8. 電話不可の明記', () => {
    test('電話不可であることが明記されていること', () => {
      const text = $('body').text();
      expect(text).toMatch(/電話不可|電話.*不可|電話.*できません/);
    });

    test('電話不可の理由（誤交付防止等）が説明されていること', () => {
      const text = $('body').text();
      // 誤交付防止、本人確認、証跡のいずれかの言及
      const hasReason =
        text.includes('誤交付') ||
        text.includes('本人確認') ||
        text.includes('証跡') ||
        text.includes('記録');
      expect(hasReason).toBe(true);
    });
  });

  describe('9. メタ情報', () => {
    test('タイトルタグが設定されていること', () => {
      const title = $('title').text();
      expect(title.length).toBeGreaterThan(0);
      expect(title).toMatch(/一次判定|商標|簡易調査/);
    });

    test('meta descriptionが設定されていること', () => {
      const metaDesc = $('meta[name="description"]').attr('content');
      expect(metaDesc).toBeDefined();
      expect(metaDesc.length).toBeGreaterThan(0);
    });
  });
});
