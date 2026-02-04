<h1>Realtime Meeting & Live Poll System</h1>

<section>
<p>Socket.IO を利用した <strong>リアルタイム会議支援システム</strong> です。<br>
管理者・参加者・投影画面の3ロール構成で、チャット型のテキスト回答および選択式アンケートをリアルタイムに集計・表示します。</p>

<p>研修会・講演会・学会・社内会議など、多人数参加型イベントでの即時フィードバック収集を目的としています。</p>
</section>

<section>
<h2>✨ 主な機能</h2>

<h3>🧑‍💼 会議（Meeting）管理</h3>
<ul>
<li>会議の作成（UUID自動生成）</li>
<li>会議の開閉ステータス管理</li>
<li>タイトルのリアルタイム更新</li>
</ul>

<h3>🗳 アンケート（Poll）機能</h3>
<ul>
<li>選択式 / テキスト式アンケート対応</li>
<li>投票開始・停止のリアルタイム制御</li>
<li>投影画面への表示ON/OFF切替</li>
<li>複数回答設定（multiAnswer）</li>
</ul>

<h3>📊 リアルタイム集計</h3>
<ul>
<li>投票はバッファリング後1秒ごとにDB反映</li>
<li>全画面へ即時結果配信</li>
</ul>

<h3>💬 テキスト回答機能</h3>
<ul>
<li>参加者から自由記述投稿</li>
<li>管理者が表示可否を制御可能</li>
</ul>

<h3>👥 クライアント管理</h3>
<ul>
<li>参加者一覧を管理者画面に表示</li>
<li>プレビュー接続は自動除外</li>
</ul>
</section>

<section>
<h2>🛠 技術スタック</h2>
<table>
<tr><th>分類</th><th>技術</th></tr>
<tr><td>サーバー</td><td>Node.js / Express</td></tr>
<tr><td>リアルタイム通信</td><td>Socket.IO</td></tr>
<tr><td>データベース</td><td>SQLite3</td></tr>
<tr><td>ID生成</td><td>UUID v4</td></tr>
</table>
</section>

<section>
<h2>📦 データベース構造</h2>
<table>
<tr><th>テーブル</th><th>内容</th></tr>
<tr><td>meetings</td><td>会議情報</td></tr>
<tr><td>polls</td><td>アンケート情報</td></tr>
<tr><td>options</td><td>選択肢と得票数</td></tr>
<tr><td>answers</td><td>テキスト回答</td></tr>
<tr><td>meeting_settings</td><td>会議ごとの設定値</td></tr>
</table>
</section>

<section>
<h2>🚀 セットアップ</h2>
<pre>npm install
node server.js</pre>

<table>
<tr><th>画面</th><th>URL</th></tr>
<tr><td>管理者</td><td>http://localhost:3000/admin</td></tr>
</table>
</section>

<section>
<h2>🔌 Socket.IO イベント一覧</h2>

<h3>📤 クライアント → サーバー</h3>
<table>
<tr><th>イベント</th><th>説明</th></tr>
<tr><td><code>createMeeting</code></td><td>会議作成</td></tr>
<tr><td><code>toggleMeeting</code></td><td>会議の開閉切替</td></tr>
<tr><td><code>createPoll</code></td><td>アンケート作成</td></tr>
<tr><td><code>switchPoll</code></td><td>表示アンケート切替</td></tr>
<tr><td><code>togglePollStatus</code></td><td>投票開始/停止</td></tr>
<tr><td><code>toggleScreen</code></td><td>投影表示ON/OFF</td></tr>
<tr><td><code>vote</code></td><td>選択肢投票</td></tr>
<tr><td><code>submitText</code></td><td>自由記述回答送信</td></tr>
</table>

<h3>📥 サーバー → クライアント</h3>
<table>
<tr><th>イベント</th><th>内容</th></tr>
<tr><td><code>meeting</code></td><td>会議状態</td></tr>
<tr><td><code>poll</code></td><td>現在のアンケート情報</td></tr>
<tr><td><code>pollList</code></td><td>アンケート一覧（管理者）</td></tr>
<tr><td><code>settings</code></td><td>会議設定</td></tr>
<tr><td><code>clients</code></td><td>参加者一覧</td></tr>
</table>
</section>

<section>
<h2>🌐 REST API（負荷試験用）</h2>
<table>
<tr><th>メソッド</th><th>エンドポイント</th><th>内容</th></tr>
<tr><td>POST</td><td><code>/api/meetings/:meetingId/text</code></td><td>テキスト回答送信</td></tr>
</table>
</section>

<section>
<h2>🔒 本番利用時の推奨対策</h2>
<ul>
<li>HTTPS化</li>
<li>管理者認証の追加</li>
<li>入力値バリデーション強化</li>
<li>レート制限導入</li>
<li>DBバックアップ設定</li>
</ul>
</section>

<section>
<h2>📄 ライセンス</h2>
MIT License
</section>
