var mas = ["kotik_photo.jpg","1.jpg","2.jpg","3.jpg","4.jpg","5.jpg","6.jpg","qr_code.png"] // массив картинок
var to = -1;  // Счетчик, указывающий на текущую картинки

function right_arrow() // Открытие следующей картинки(движение вправо)
{ 
 var obj = document.getElementById("img");
  if (to < mas.length-1)  to++ 
   else
     to = 0;
     obj.src = mas[to];	 
}

function left_arrow() // Открытие предыдущей картинки(движение влево)
{     
 var obj = document.getElementById("img");
if (to > 0) to--;
  else
    to = mas.length-1;
    obj.src = mas[to];	  			 
}