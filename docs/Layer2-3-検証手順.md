# Layer 2 / Layer 3 外部検証手順（第一歩）

## 前提

- Windows ビー上で `ne_gateway.py` が **8888** ポートで稼働していること
- **Flask 開発サーバ**使用（本番運用向けではない）
- **Cloudflare Quick Tunnel** の URL は **cloudflared を起動するたびに変わる**

## 手順

### 1. Ne ゲートウェイ起動

プロジェクトルートで:

```powershell
python ne_gateway.py --port 8888
```

ログに次が出ていることを確認する。

```text
--- BE-V-ENGINE: PORT 8888 ACTIVE ---
```

### 2. トンネル起動

別の PowerShell で:

```powershell
cloudflared tunnel --url http://127.0.0.1:8888
```

PATH に `cloudflared` がない場合はフルパスで実行する。

```powershell
& "C:\path\to\cloudflared.exe" tunnel --url http://127.0.0.1:8888
```

表示される **ベース URL**（例: `https://xxxx.trycloudflare.com`）をメモする。

### 3. 外部端末でアクセス

iPhone / 別 PC のブラウザなどから、次の **2 本**を開く（または GET する）。

| 目的 | URL | 期待される結果 |
|------|-----|----------------|
| **Layer 2** | `https://〈トンネルURL〉/` | 本文が `TOMORI_ENGINE_LAYER_2_ONLINE` |
| **Layer 3** | `https://〈トンネルURL〉/complete?case_id=demo-001` | JSON が返る |

Layer 3 の JSON の例（`updated_at` は実行タイミングで変わる）:

```json
{
  "case_id": "demo-001",
  "reviewed": true,
  "payload": "SUCCESS",
  "updated_at": "2026-03-20T12:34:56.789012+00:00"
}
```

## 確認ポイント

- **`/`** が Layer 2 の文字列を返すこと
- **`/complete?case_id=demo-001`** が Layer 3 の JSON を返すこと
- JSON 内の **`updated_at`** は都度変動してよい

## 注意

- **8888 のトンネルだけ**では **8080（GLB 静的 UI）は外部に出ない**。UI を見せる場合は **8080 用に別トンネル**が必要。
- **URL に認証はない**。個人情報・重要データを載せない。
- **本番運用・認証・決済・HTTPS 常設**は別設計とする。
