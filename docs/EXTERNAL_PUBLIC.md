# 外部公開・実機確認（8080 Web / 8888 NE Gateway）

## いまのローカル疎通（同一 PC）

- Web（PWA シェル）: `http://127.0.0.1:8080/`
- NE Gateway: `http://127.0.0.1:8888/health` → `{"ok":true,"service":"ne_gateway"}`

同一 LAN のスマホから試す場合（Windows ファイアウォールで許可が必要なことがあります）:

- `http://<このPCのLAN IP>:8080/`
- `http://<このPCのLAN IP>:8888/health`

## Cloudflare Quick Tunnel（世界向け URL を出す）

1. `cloudflared` をインストールし、PATH に通す（または exe のフルパスで実行）。
2. **Web だけ**公開する例:

   ```powershell
   cloudflared tunnel --url http://127.0.0.1:8080
   ```

3. ターミナルに表示された `https://....trycloudflare.com` をメモし、外部ブラウザで開く。  
   **起動のたびに URL は変わる**ので、毎回その画面のホスト名を使う。

4. NE Gateway を別 URL で公開する場合は、別ターミナルで:

   ```powershell
   cloudflared tunnel --url http://127.0.0.1:8888
   ```

## 実装メモ（期待値をずらさない）

- 現在の **無料枠 Web** は `BEE_API_ENABLED = false` のため、ブラウザから **NE Gateway へ翻訳 API を呼ばない**設計です。対話モード・翻訳は **同梱バンドル（例: hello / thank you）＋端末ローカル辞書**で完結します。
- フッターの **Stripe** は外部リンクのみ（決済完了とアプリ内機能の自動連携は未実装）。
- 「5万語辞書」はこのリポジトリの現状ビルドには含まれていません（別パイプラインで `custom_dictionary_150.csv` 等を組み込む想定）。

## GitHub Pages で静的 Web だけ出す（トンネル不要の選択肢）

リポジトリ設定で Pages の公開元を `web/` または `docs/` に合わせ、ルートに `index.html` が来るよう配置する必要があります。現状は `web/index.html` なので、**Actions または `docs/` へコピーする運用**のどちらかで合わせてください。
