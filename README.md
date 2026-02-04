

<h1>Realtime Chat & Live Poll System</h1>

<section>
<p>
ブラウザのみで利用できる <strong>リアルタイム双方向コミュニケーションWebアプリケーション</strong> です。<br>
Socket.IO を利用し、チャット・アンケート（投票）・参加者状況の共有をリアルタイムに実現します。
</p>
<p>
研修会、講演会、カンファレンス、会議、イベントなど<br>
<strong>多人数が同時参加する場での即時コミュニケーション</strong> を目的に設計されています。
</p>
</section>

<section>
<h2>✨ 主な機能</h2>

<h3>💬 リアルタイムチャット</h3>
<ul>
<li>投稿メッセージを即時全体配信</li>
<li>ページ再読み込み不要</li>
<li>同時接続にも対応する軽量構成</li>
</ul>

<h3>🗳 リアルタイムアンケート（投票）</h3>
<ul>
<li>管理者がアンケートを開始／終了</li>
<li>参加者はスマホから即回答</li>
<li>結果をリアルタイム自動集計</li>
</ul>

<h3>👨‍💼 管理者ダッシュボード</h3>
<ul>
<li>アンケート制御（開始・終了）</li>
<li>投稿状況の監視</li>
<li>進行用モニタとして利用可能</li>
</ul>

<h3>👥 参加者画面</h3>
<ul>
<li>ログイン不要（ルームID方式）</li>
<li>直感的に操作できるシンプルUI</li>
<li>スマートフォン・タブレット対応</li>
</ul>

<h3>💾 データ保存</h3>
<ul>
<li>SQLite による軽量データ管理</li>
<li>チャットログ・投票結果の保存が可能</li>
</ul>
</section>

<section>
<h2>🛠 技術スタック</h2>
<table>
<tr><th>分類</th><th>技術</th></tr>
<tr><td>サーバー</td><td>Node.js / Express</td></tr>
<tr><td>リアルタイム通信</td><td>Socket.IO</td></tr>
<tr><td>データベース</td><td>SQLite3</td></tr>
<tr><td>フロントエンド</td><td>HTML / CSS / Vanilla JavaScript</td></tr>
<tr><td>ID生成</td><td>UUID</td></tr>
</table>
</section>

<section>
<h2>📁 ディレクトリ構成（例）</h2>
<pre>
realtimechat/
├─ server.js
├─ package.json
├─ meeting_poll.db
├─ public/
│   ├─ admin.html
│   ├─ participant.html
│   ├─ js/client.js
│   └─ css/style.css
└─ README.md
</pre>
</section>

<section>
<h2>🚀 セットアップ</h2>

<h3>1. リポジトリをクローン</h3>
<pre>git clone https://github.com/clinicalpathroom/realtimechat.git
cd realtimechat</pre>

<h3>2. 依存パッケージをインストール</h3>
<pre>npm install</pre>

<h3>3. サーバー起動</h3>
<pre>node server.js
# または
npm start</pre>

<h3>4. ブラウザでアクセス</h3>
<table>
<tr><th>画面</th><th>URL</th></tr>
<tr><td>管理者</td><td>http://localhost:3000/admin</td></tr>
</table>
</section>

<section>
<h2>🔌 主なSocketイベント</h2>
<table>
<tr><th>イベント名</th><th>説明</th></tr>
<tr><td><code>join-room</code></td><td>指定ルームへ参加</td></tr>
<tr><td><code>new-message</code></td><td>チャット投稿</td></tr>
<tr><td><code>start-poll</code></td><td>アンケート開始（管理者）</td></tr>
<tr><td><code>end-poll</code></td><td>アンケート終了（管理者）</td></tr>
<tr><td><code>vote</code></td><td>投票送信</td></tr>
<tr><td><code>poll-update</code></td><td>投票結果のリアルタイム配信</td></tr>
</table>
</section>

<section>
<h2>🎯 想定利用シーン</h2>
<ul>
<li>医療・教育分野の研修会</li>
<li>学会・講演会のリアルタイム質問受付</li>
<li>社内会議での匿名アンケート</li>
<li>イベントでの参加型投票</li>
</ul>
</section>

<section>
<h2>🔒 注意事項</h2>
<ul>
<li>ローカルまたは限定ネットワーク内での利用を想定</li>
<li>本番利用時は以下の対策を推奨：
  <ul>
    <li>HTTPS化</li>
    <li>管理者認証の追加</li>
    <li>DBバックアップ設定</li>
    <li>レート制限などの不正アクセス対策</li>
  </ul>
</li>
</ul>
</section>

<section>
<h2>📄 ライセンス</h2>
<p>MIT License</p>
</section>

