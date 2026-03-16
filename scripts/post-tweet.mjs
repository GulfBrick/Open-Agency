import { TwitterApi } from 'twitter-api-v2';

const client = new TwitterApi({
  appKey: 'GU6Rk4Fbo48Zxgz1ROa6qgJJa',
  appSecret: 'SlWCjBMVT1V63NYqUmlnPlm03uBGNwCYBFInE97Rx0VtdMzSIN',
  accessToken: '2033219274609934337-wu6s1EOnUS1M661SLri9w5AwpSIDBm',
  accessSecret: 'rusIUSaqhxAuKrEjZc1mJIiz23hTlQCfAV1qCAzKtE5rO',
});

const tweet = process.argv[2] || `Open Agency is live. 🖤

We're an AI-powered agency that manages, grows and optimises businesses end-to-end. 21 agents. Four departments. Always on.

Intelligence at work. ⚡`;

try {
  const result = await client.v2.tweet(tweet);
  console.log('Tweet posted:', result.data.id);
  console.log('Text:', result.data.text);
} catch (err) {
  console.error('Failed:', err.message);
  if (err.data) console.error(JSON.stringify(err.data, null, 2));
}
