export const grammarHelp = {
  javascript: {
    const: ['const', '다시 대입할 수 없는 변수 선언 키워드예요. 선언 시 값을 지정해야 합니다.'],
    let: ['let', '값을 다시 대입할 수 있는 블록 범위 변수 선언 키워드예요.'],
    var: ['var', '함수 범위 변수 선언 키워드예요. 요즘 코드는 보통 const나 let을 사용합니다.'],
    async: ['async', '함수를 비동기 함수로 선언해 내부에서 await를 사용할 수 있게 합니다.'],
    await: ['await', 'Promise가 완료될 때까지 비동기 함수의 다음 실행을 기다립니다.'],
    function: ['function', '재사용할 동작을 정의하는 함수 선언 키워드예요.'],
    Arrow: ['화살표 함수', '매개변수와 실행할 표현식을 연결하는 함수 문법이에요.'],
    ReturnStatement: ['return 문', '함수 실행을 끝내고 호출한 곳에 값을 돌려줍니다.'],
    if: ['if 조건문', '조건식이 참일 때 중괄호 안의 코드를 실행합니다.'],
    else: ['else 분기', '앞선 if 조건이 거짓일 때 실행할 대체 경로예요.'],
    try: ['try 블록', '실행 중 오류가 발생할 수 있는 코드를 감쌉니다.'],
    catch: ['catch 블록', 'try에서 발생해 전달된 오류를 받아 처리합니다.'],
    throw: ['throw 문', '오류 객체를 발생시켜 현재 실행 흐름을 오류 처리 경로로 보냅니다.'],
    CallExpression: ['함수 호출', '함수 이름 뒤에 괄호를 붙여 함수를 실행하는 표현식이에요.'],
    VariableDefinition: ['변수 이름', '값을 저장할 변수를 선언하는 식별자예요.'],
    VariableName: ['변수 참조', '앞서 선언한 변수의 값을 읽거나 다른 표현식에 전달합니다.'],
    PropertyName: ['객체 속성 이름', '점 표기법이나 객체 리터럴에서 객체의 속성을 가리킵니다.'],
    String: ['문자열 리터럴', '따옴표로 감싼 텍스트 값이에요.'],
    TemplateString: ['템플릿 문자열', '백틱으로 감싸며 ${...} 안에 표현식의 결과를 삽입할 수 있습니다.'],
    AwaitExpression: ['await 표현식', '비동기 결과를 기다린 뒤 완료된 값을 다음 표현식에 전달합니다.'],
  },
  html: {
    StartTag: ['시작 태그', '요소의 시작을 선언하고 태그 이름과 속성을 담습니다.'],
    EndTag: ['태그 닫기 기호', '시작 태그나 속성 목록의 끝을 표시합니다.'],
    TagName: ['태그 이름', '브라우저가 만들 HTML 요소의 종류를 지정합니다.'],
    AttributeName: ['속성 이름', '요소에 추가 설정이나 의미를 부여합니다. 예: id, class, href, alt.'],
    AttributeValue: ['속성 값', '속성 이름에 대응하는 설정값이에요.'],
    Text: ['텍스트 노드', 'HTML 태그가 아닌, 화면에 표시되는 요소 내부의 글자입니다.'],
    SelfClosingTag: ['빈 요소 태그', 'img, input처럼 별도의 닫는 태그 없이 쓰이는 요소의 형태예요.'],
  },
  css: {
    RuleSet: ['CSS 규칙', '선택자와 선언 블록을 묶어 어떤 요소에 어떤 스타일을 적용할지 정합니다.'],
    ClassName: ['클래스 선택자 이름', 'class 속성이 같은 HTML 요소들을 선택합니다. CSS에서는 앞에 점을 붙여 씁니다.'],
    IdName: ['ID 선택자 이름', 'id가 일치하는 요소를 선택합니다. CSS에서는 앞에 #을 붙여 씁니다.'],
    TagName: ['요소 선택자', '해당 HTML 태그 이름을 가진 요소를 선택합니다.'],
    PropertyName: ['CSS 속성', '바꾸려는 스타일 항목을 지정합니다. 예: color, display, margin.'],
    ValueName: ['CSS 값', '속성에 적용할 스타일 값을 지정합니다.'],
    NumberLiteral: ['숫자 값', 'CSS 속성에 쓰인 수치예요. 뒤에 단위가 붙을 수 있습니다.'],
    Unit: ['CSS 단위', '숫자 값의 기준을 나타냅니다. 예: px, rem, %.'],
    Declaration: ['CSS 선언', '속성과 값을 콜론으로 연결해 하나의 스타일을 지정합니다.'],
  },
};

export function findGrammarHelp(language, syntaxNode) {
  let node = syntaxNode;
  while (node) {
    const definition = grammarHelp[language]?.[node.name];
    if (definition) return { definition, node };
    node = node.parent;
  }
  return syntaxNode ? { definition: [syntaxNode.name, '현재 문법 모드에서 선택한 코드 요소입니다.'], node: syntaxNode } : null;
}
