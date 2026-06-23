# 잘 쓴 글의 특징 & 작법 (Writing Craft)

우리 책의 **글쓰기**는 이 원칙을 따른다. 웹의 최고 인터랙티브 익스플레이너와 그래픽스/기술 명문을
직접 읽고 "왜 잘 쓰였는가"를 분석해 뽑았다. [AUTHORING-GUIDE.md](./AUTHORING-GUIDE.md)와 함께 집필 전 필독.

## 모범 사례 (읽고 배울 글)
- **인터랙티브 익스플레이너**: [Bartosz Ciechanowski](https://ciechanow.ski/)(위젯 먼저·수식 나중의 표준),
  [Red Blob Games](https://www.redblobgames.com/pathfinding/a-star/introduction.html)(알고리즘 family 점진 빌드),
  [Bret Victor "Explorable Explanations"](https://worrydream.com/ExplorableExplanations/),
  [3Blue1Brown](https://www.3blue1brown.com/)(정의는 도착점), [Distill.pub](https://distill.pub/),
  [Josh Comeau](https://www.joshwcomeau.com/), [Nicky Case](https://explorabl.es/).
- **그래픽스·기술 명문**: [Inigo Quilez](https://iquilezles.org/articles/)(효과→공식, 정확/근사 분리),
  [The Book of Shaders](https://thebookofshaders.com/)(구체 값 지정+라이브), [Nathan Reed](https://www.reedbeta.com/blog/)(공식 재유도),
  [Fabian "ryg" Giesen](https://fgiesen.wordpress.com/)(숫자·스케일 비유), [Catlike Coding](https://catlikecoding.com/)(변경→결과→이유),
  [PBR Book](https://pbr-book.org/)(literate programming), [Ben Golus](https://bgolus.medium.com/)(naive가 실패하는 걸 보임),
  [Freya Holmér](https://www.youtube.com/watch?v=jvPPXbo87ds)(직관에 이름), [Alan Zucconi](https://www.alanzucconi.com/), [acko.net](https://acko.net/).

## 공통 특징 (왜 잘 쓰였나)
1. **효과/현상/실패가 먼저, 정의·공식은 마지막.** 명문 중 정의로 시작하는 글은 거의 없다. 수식은 "방금 본 것의 요약".
2. **조작이 수식보다 먼저** — 슬라이더로 현상을 *체감*시킨 뒤 그것을 식으로 설명.
3. **한 위젯 = 한 변수/개념.** 신개념에 5-노브 패널을 던지지 않는다.
4. **공식은 나열 말고 유도.** 핵심 상수/형태 하나는 화면에서 끌어낸다(예: 1/π, "lerp의 lerp"=베지에).
5. **결과가 아니라 메커니즘.** naive 버전이 *깨지는 걸* 같은 장면에서 토글로 보인다. **막다른 길을 남기는 것**이 최고의 신뢰 장치.
6. **점진적 빌드.** 단순→복잡을 family로 쌓아 비교(BFS→A*, 직교→원근).
7. **추상물은 일상 비유가 아니라 정확한 기술 서술로.** 일상 사물/상황에 빗대지 말고 도메인 정의로 설명한다(도메인 내 수학적 대응은 OK: smin ≈ ReLU). **"직관 손잡이" 박스는 폐지 — 쓰지 않는다.**
8. **동기 → 형식화.** 정의는 *문제를 느낀 뒤*에 온다.
9. **병목을 콕 집고**, 독자의 혼란/반박을 미리 입으로 말한다(접이식 "왜?" 박스).
10. **한계·근사를 솔직히 + 구조로**(정확/근사 블록, 트레이드오프 표), 항상 다음 단계 포인터와 함께 — 신뢰가 *오른다*.
11. **다이어그램은 증명이지 장식이 아니다.** 모든 시각요소는 본문과 같은 한 점을 말한다(목적 없는 애니 금지 → 정적 장면은 `animate={false}`).
12. **표기는 싸고·국소적·불변**(p/r/k를 절마다 안 바꿈). 다른 분야 독자에겐 정확한 도메인 정의로 다리(일상 비유 금지).
13. **따뜻한 2인칭 + 정정 초대 + 어려움 솔직 인정** → 권위 잃지 않고 장벽을 낮춘다.
14. **2-독자 레이어링.** 복붙 가능한 구현은 위, 선택적 유도는 아래 — 성급한 독자와 엄밀한 독자를 한 페이지에서 동시에.
15. **predict-then-reveal.** "20·2·0.2를 넣어보라 — 주파수가 어떻게 압축되는지 보라"처럼 만질 값과 결과를 예고.

## 실천 체크리스트 (집필 시)
- [ ] 첫 문장은 **정의 금지** — 현상·미스터리·완성 데모로 후킹. 위젯을 수식 *위*에 둔다.
- [ ] **위젯 하나당 새 변수 하나.**
- [ ] **naive→correct 토글**을 같은 장면에. 실패한 시도를 지우지 말 것.
- [ ] 적어도 핵심 공식 하나는 **화면에서 유도**. 엄밀 증명은 접이식/각주.
- [ ] 형식 객체는 KaTeX 옆에 **정확한 한 문장 기술 설명**(일상 비유·직관 손잡이 금지).
- [ ] **내부 상태 시각화 토글**(벡터·버퍼·스텝 카운트·곡률 빗).
- [ ] **"여기서 가장 헷갈리는 지점"**을 한 박스로 인정·집중.
- [ ] **한계·근사 명시 + 다음 절 포인터.**
- [ ] **표기 일관·국소.** 그림은 "이 코드가 이 결과를 내는가"의 증명으로만.
- [ ] **따뜻한 2인칭 · predict-then-reveal · 2-독자 레이어링.**

> 우리 데모는 *진짜* 인터랙티브라 pre-render였던 원본들보다 **더 멀리** 갈 수 있다. 핵심: 위젯이 직관을
> 만들고 → 산문이 "왜 이 공식이어야 하는가"를 한계까지 솔직하게 재유도하며 → naive 실패를 같은 장면에서 보인다.
