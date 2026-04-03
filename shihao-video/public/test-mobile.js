// Mobile detection test
console.log('User Agent:', navigator.userAgent);
console.log('Is Mobile:', /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));