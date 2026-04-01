const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors()); // 全ドメイン許可：GitHub Pagesからの通信を最優先
app.use(express.json());

// 0円・無限・即答辞書
const dictionary = {
    'おはようございます': 'Good morning',
    'おはよう': 'Good morning',
    'ありがとう': 'Thank you',
    'ありがとうございます': 'Thank you',
    '駅はどこですか': 'Where is the station?',
    'トイレはどこですか': 'Where is the restroom?',
    '助けてください': 'Please help me',
    'チェックアウトをお願いします': 'I would like to check out.'
};

// 生存確認用
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'GLB_QUICK_API' }));

// 翻訳本線
app.post('/translate', (req, res) => {
    const { text } = req.body;

    // 空入力ガード
    if (!text || !String(text).trim()) {
        return res.status(400).json({ decision: 'HOLD', reason: 'INPUT REQUIRED' });
    }

    const input = text.trim();
    const translated = dictionary[input];

    if (translated) {
        console.log(`[HIT] ${input} -> ${translated}`);
        return res.json({ decision: 'GO', result: translated, status: 'success' });
    }

    // 辞書にない場合（クラウド連携待ち）
    console.log(`[MISS] ${input}`);
    res.json({ 
        decision: 'GO', 
        result: 'Translation pending (Cloud Sync required).', 
        status: 'fallback' 
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================`);
    console.log(` GLB QUICK_BASE ACTIVE ON PORT ${PORT}`);
    console.log(`====================================`);
});
