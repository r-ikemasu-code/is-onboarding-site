// GitHub API でリポジトリ作成 & Pages 有効化
const https = require('https');
const { execSync } = require('child_process');

// Git の credential helper からトークンを取得する試行
function getToken() {
  // 環境変数チェック
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  
  // git credential helper から取得を試みる
  try {
    const result = execSync(
      'echo protocol=https\nhost=github.com | git credential fill',
      { encoding: 'utf-8', timeout: 5000 }
    );
    const match = result.match(/password=(.+)/);
    if (match) return match[1].trim();
  } catch (e) {}
  
  return null;
}

function apiCall(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const opts = {
      hostname: 'api.github.com',
      path, method,
      headers: {
        'User-Agent': 'Node',
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {})
      }
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d || '{}') }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const token = getToken();
  if (!token) {
    console.log('❌ GitHub トークンが見つかりません。');
    console.log('以下のどちらかで設定してください：');
    console.log('  set GITHUB_TOKEN=ghp_xxxxx');
    console.log('  または GitHub にログイン済みの git credential');
    process.exit(1);
  }
  console.log('✅ トークン取得OK');

  const repoName = 'is-onboarding';
  
  // 1. リポジトリ作成
  console.log(`📦 リポジトリ "${repoName}" を作成中...`);
  const createRes = await apiCall('POST', '/user/repos', {
    name: repoName,
    description: 'IS オンボーディング 知識チェックテスト',
    private: false,
    auto_init: false,
  }, token);
  
  if (createRes.status === 201) {
    console.log(`✅ 作成完了: ${createRes.data.html_url}`);
  } else if (createRes.status === 422 && JSON.stringify(createRes.data).includes('already exists')) {
    console.log('⚠️ リポジトリは既に存在します。続行します。');
  } else {
    console.log(`❌ 作成失敗 (${createRes.status}):`, JSON.stringify(createRes.data));
    process.exit(1);
  }

  // 2. リモート追加 & プッシュ
  const owner = createRes.data?.owner?.login || 'r-ikemasu-code';
  const remoteUrl = `https://github.com/${owner}/${repoName}.git`;
  console.log(`🔗 リモート: ${remoteUrl}`);
  
  try { execSync(`git remote remove origin`, { stdio: 'ignore' }); } catch {}
  execSync(`git remote add origin ${remoteUrl}`);
  execSync(`git branch -M main`);
  
  console.log('🚀 プッシュ中...');
  execSync(`git push -u origin main`, { stdio: 'inherit' });
  console.log('✅ プッシュ完了');

  // 3. GitHub Pages 有効化
  console.log('📄 GitHub Pages を有効化中...');
  const pagesRes = await apiCall('POST', `/repos/${owner}/${repoName}/pages`, {
    source: { branch: 'main', path: '/' }
  }, token);
  
  if (pagesRes.status === 201 || pagesRes.status === 409) {
    console.log('✅ GitHub Pages 有効化完了');
  } else {
    console.log(`⚠️ Pages 設定 (${pagesRes.status}):`, JSON.stringify(pagesRes.data));
    console.log('→ 手動で Settings > Pages から main ブランチを選択してください');
  }

  console.log('');
  console.log(`🎉 完了！数分後にアクセスできます：`);
  console.log(`   https://${owner}.github.io/${repoName}/`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
