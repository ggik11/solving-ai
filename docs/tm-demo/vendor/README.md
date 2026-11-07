# 데모 페이지에 포함한 라이브러리

시연 중 외부 CDN(jsdelivr) 상태나 학교 네트워크에 영향받지 않도록, 데모가 쓰는 라이브러리를 이 폴더에 그대로 포함했다. 버전은 앱(`package.json`)과 같다. 파일은 npm 레지스트리에 공개된 패키지의 `dist/` 파일을 수정하지 않고 복사했다.

| 파일 | 패키지 | 버전 | 라이선스 | SHA-256 |
|---|---|---|---|---|
| `tf-1.3.1.min.js` | `@tensorflow/tfjs` (`dist/tf.min.js`) | 1.3.1 | Apache-2.0 | `cacc44b288b5e3362fe388e8058cdb9027e54018725c373d4c8d4831c1cbbd0f` |
| `teachablemachine-image-0.8.5.min.js` | `@teachablemachine/image` (`dist/teachablemachine-image.min.js`) | 0.8.5 | Apache-2.0 | `5884abc35431a9f828568f9916fc79a3a4e54c7cccb930458f0eb4b2160bd0c5` |

- `LICENSE-Apache-2.0.txt`: Apache License 2.0 전문
- `teachablemachine-image-0.8.5.min.js.LICENSE.txt`: 패키지에 함께 배포된 제3자 고지

Copyright 2019 Google LLC (TensorFlow.js, Teachable Machine). Apache License 2.0에 따라 재배포한다.
