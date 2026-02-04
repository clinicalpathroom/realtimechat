Realtime Chat & Live Poll System

ブラウザのみで利用できる リアルタイム双方向コミュニケーションWebアプリケーション です。
Socket.IO を利用し、チャット・アンケート（投票）・参加者状況の共有をリアルタイムに実現します。

研修会、講演会、カンファレンス、会議、イベントなど
「多人数が同時参加する場での即時コミュニケーション」 を目的に設計されています。

✨ 主な機能
💬 リアルタイムチャット

投稿メッセージを即時全体配信

ページ再読み込み不要

軽量構成で同時接続に対応

🗳 リアルタイムアンケート（投票）

管理者がアンケートを開始／終了

参加者はスマホから即回答

結果をリアルタイム自動集計

👨‍💼 管理者ダッシュボード

アンケート制御（開始・終了）

投稿状況の監視

セッション進行補助ツールとして利用可能

👥 参加者画面

ログイン不要（ルームID方式）

シンプルUIで直感的操作

スマートフォン・タブレット対応

💾 データ保存

SQLite による軽量データ管理

チャットログ・投票結果の保存が可能

🛠 技術スタック
分類	技術
サーバー	Node.js / Express
リアルタイム通信	Socket.IO
データベース	SQLite3
フロントエンド	HTML / CSS / Vanilla JavaScript
ID生成	UUID
📁 ディレクトリ構成（例）
realtimechat/
├─ server.js              # メインサーバー
├─ package.json
├─ db.sqlite3             # SQLiteデータベースファイル
├─ routes/                # APIルーティング
├─ public/                # フロントエンド
│   ├─ admin.html
│   ├─ participant.html
│   ├─ js/
│   │   └─ client.js
│   └─ css/
│       └─ style.css
└─ README.md

🚀 セットアップ
1. リポジトリをクローン
git clone https://github.com/yourname/realtimechat.git
cd realtimechat

2. 依存パッケージをインストール
npm install

3. サーバー起動
node server.js


または

npm start

4. ブラウザでアクセス
画面	URL
管理者	http://localhost:3000/admin

参加者	http://localhost:3000/participant
🔌 主なSocketイベント
イベント名	説明
join-room	指定ルームへ参加
new-message	チャット投稿
start-poll	アンケート開始（管理者）
end-poll	アンケート終了（管理者）
vote	投票送信
poll-update	投票結果のリアルタイム配信
🎯 想定利用シーン

医療・教育分野の研修会

学会・講演会のリアルタイム質問受付

社内会議での匿名アンケート

イベントでの参加型投票

🔒 注意事項

本システムはローカル運用または限定ネットワーク内利用を想定しています

本番環境で使用する場合は以下の対策を推奨します

HTTPS化

管理者認証の追加

データベースのバックアップ設定

不正アクセス対策（レート制限等）

📄 ライセンス

MIT License
