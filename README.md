# qatalkai

## Overview
QATalkAI is a web application for outbound phone surveys and product outreach, powered by AI-driven Q&A matching. Twilio automates calls, while voice recognition and TTS conduct surveys and pitch conversations; results are stored in a database.

Key features:
- Voice input with automatic transcription (OpenAI Whisper)
- Three answer logic modes (direct AI, Q-only matching, full Q&A matching)
- Project-based Q&A management with short URL IDs
- QR code generation for each project
- Excel import/export for Q&A sheets
- Admin panel for projects, Q&A, users, and settings management
- Mobile-first responsive design with microphone permission guidance
- Sales training mode with role-play conversations

## Installation

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- OpenAI API key (for Whisper and GPT)

### Local Installation

1. Clone the repository:
```bash
git clone https://github.com/daishir0/qatalkai
cd qatalkai
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your DATABASE_URL and SESSION_SECRET
```

4. Set up the database:
```bash
# Create PostgreSQL database
sudo -u postgres psql -c "CREATE USER qatalkai WITH PASSWORD 'your-password' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE qatalkai OWNER qatalkai;"

# Run migrations
npx prisma migrate deploy

# Seed initial data
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
```

5. Build and start:
```bash
npm run build
npm start
```

## Usage

1. Access the application at your configured URL (default: http://localhost:3028)
2. Log in to the admin panel. The admin email defaults to `admin@example.com` (override with `ADMIN_EMAIL`). If `ADMIN_PASSWORD` is not set, the seed script generates a random password and prints it once to the console — save it immediately.
3. Navigate using the sidebar:
   - **Dashboard**: View system statistics
   - **Projects**: Create and manage projects with Q&A sheets
   - **Users**: Manage admin users
   - **Settings**: Configure API keys, models, and answer logic

### Key Workflows

#### Setting Up a Project
1. Go to Projects → Create new project
2. Add Q&A pairs manually or import from Excel
3. View the QR code for the project's public URL
4. Share the QR code on product flyers

#### Public Question Flow
1. Visitor scans QR code → opens `/q/{shortId}`
2. Taps the microphone button → records voice (max 10 seconds)
3. Voice is transcribed via Whisper API
4. Transcription is displayed for optional editing
5. Question is matched against Q&A sheet → answer displayed

#### Answer Logic Modes
- **Logic 1 (Direct)**: Sends question directly to GPT without Q&A sheet
- **Logic 2 (Q-match, default)**: Sends question + Q-only list to GPT, returns top 3 matching Q&A pairs (less hallucination)
- **Logic 3 (Q&A-match)**: Sends question + full Q&A pairs to GPT, returns top 3 matches

## Notes
- OpenAI API key must be configured in Settings before voice features work
- For production, change the default admin password immediately
- The systemd service file is located at `infrastructure/systemd/qatalkai.service`

## License
This project is licensed under the MIT License - see the LICENSE file for details.

---

# qatalkai

## 概要
QATalkAIは、アウトバウンド電話アンケート・商材訴求システムです。Twilioで自動発信し、音声認識とTTSによるAI会話でアンケートや営業トークを実施。Q&Aマッチングを核とした応答ロジックで、結果をDBに保存します。

主な機能:
- 音声入力と自動文字起こし（OpenAI Whisper）
- 3つの回答ロジックモード（ダイレクトAI、Q検索マッチング、Q&A検索マッチング）
- 短いURL IDによるプロジェクトベースのQA管理
- プロジェクトごとのQRコード生成
- QAシートのExcelインポート/エクスポート
- プロジェクト・QA・ユーザー・設定の管理画面
- マイク許可ガイダンス付きモバイルファーストのレスポンシブデザイン
- セールストレーニング（ロープレ）モード

## インストール方法

### 前提条件
- Node.js 18以上
- PostgreSQL 15以上
- OpenAI APIキー（WhisperおよびGPT用）

### ローカルインストール

1. リポジトリをクローン:
```bash
git clone https://github.com/daishir0/qatalkai
cd qatalkai
```

2. 依存関係をインストール:
```bash
npm install
```

3. 環境変数を設定:
```bash
cp .env.example .env
# .envを編集してDATABASE_URLとSESSION_SECRETを設定
```

4. データベースをセットアップ:
```bash
# PostgreSQLデータベースを作成
sudo -u postgres psql -c "CREATE USER qatalkai WITH PASSWORD 'your-password' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE qatalkai OWNER qatalkai;"

# マイグレーションを実行
npx prisma migrate deploy

# 初期データを投入
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
```

5. ビルドして起動:
```bash
npm run build
npm start
```

## 使い方

1. 設定したURLでアプリケーションにアクセス（デフォルト: http://localhost:3028）
2. 管理画面にログイン。メールアドレスは既定で `admin@example.com`（`ADMIN_EMAIL` で上書き可能）。`ADMIN_PASSWORD` 未設定でseedを実行した場合は、ランダム生成されたパスワードがコンソールに1度だけ表示されるので控えてください。
3. サイドバーを使用してナビゲート:
   - **ダッシュボード**: システム統計を表示
   - **プロジェクト管理**: プロジェクトとQAシートの作成・管理
   - **ユーザー管理**: 管理者ユーザーの管理
   - **設定**: APIキー、モデル、回答ロジックの設定

### 主なワークフロー

#### プロジェクトの設定
1. プロジェクト管理 → 新規作成
2. QAペアを手動追加またはExcelからインポート
3. プロジェクトの公開URLのQRコードを表示
4. QRコードを製品チラシに掲載

#### 公開質問フロー
1. 来場者がQRコードをスキャン → `/q/{shortId}` を開く
2. マイクボタンをタップ → 音声を録音（最大10秒）
3. Whisper APIで音声をテキストに変換
4. 変換テキストが表示され、必要に応じて編集可能
5. QAシートとマッチング → 回答を表示

#### 回答ロジックモード
- **ロジック1（ダイレクト）**: QAシートを使わずGPTに直接質問
- **ロジック2（Q検索、デフォルト）**: 質問とQ一覧をGPTに送信、上位3件のQ&Aペアを返す（ハルシネーションが少ない）
- **ロジック3（Q&A検索）**: 質問とQ&A全体をGPTに送信、上位3件のマッチを返す

## 注意点
- 音声機能を使用する前に、設定画面でOpenAI APIキーを登録する必要があります
- 本番環境では、デフォルトの管理者パスワードを直ちに変更してください
- systemdサービスファイルは `infrastructure/systemd/qatalkai.service` にあります

## ライセンス
このプロジェクトはMITライセンスの下でライセンスされています。詳細はLICENSEファイルを参照してください。
