const bcrypt = require('bcryptjs');

async function hashCode(code) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(code, salt);
}

(async () => {
  const testCode = '123456';
  const hashedCode = await hashCode(testCode);
  console.log('Test Code:', testCode);
  console.log('Hashed Code:', hashedCode);
})();
