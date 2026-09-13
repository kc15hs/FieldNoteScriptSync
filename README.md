# FieldNote ScriptSync

FieldNote の ZIP データをブラウザ内で開き、元本文と読み上げ文章を対照・編集するローカル Web アプリです。

## 起動

`index.html` を Chrome または Edge で開いてください。安定したクリップボード操作と ZIP 保存のため、ローカル HTTP サーバーで開くことを推奨します。

```powershell
npx serve .
```

表示された URL を Chrome / Edge で開きます。ZIP の展開・比較はブラウザ内で行われ、サーバーには送信されません。

## ZIP 構造について

初版は ZIP 内の JSON を読み、以下の代表的なキーの組を自動検出します。

- 元本文: `sourceText`, `originalText`, `original`, `body`, `content`, `text`, `本文`, `元本文`
- 読み上げ文章: `readingText`, `script`, `narration`, `speech`, `tts`, `読み上げ文章`, `読み上げ`

保存では検出した JSON の読み上げフィールドとタイトルだけを書き戻し、それ以外の ZIP エントリは保持します。実データのキー名・イベント構造が上記と異なる場合は、サンプル ZIP に合わせて検出ルールを追加してください。

## ブラウザ上の保存

Chrome / Edge では保存先のファイル選択を通じて、同名の ZIP を選ぶことで上書きできます。Safari やモバイルブラウザでは、更新済み ZIP のダウンロードになる場合があります。
