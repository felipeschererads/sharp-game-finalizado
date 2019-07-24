var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;
var uniqid = require('uniqid');
var _ = require('lodash');

//armazena os usuários qu estão jogando neste momento
var usuarios = [];
var jogos = [];
var win = [
  [1, 2, 4],
  [1, 8, 64],
  [1, 16, 256],
  [2, 16, 128],
  [4, 32, 256],
  [4, 16, 64],
  [8, 16, 32],
  [64, 128, 256]
];

//monta um servidos http
app.use(express.static('public'));

//roda o servidor em determinada porta
http.listen(port, () => {
  console.log(`Server rodando na porta ${port}`);
})

//funcionalidades do jogo
//variavel io gerencia todos os sockets
//socket
io.on('connection', (socket) => {
  userConnected(socket);

  //eventos do socket
  //uando o usuário edita o proprio nome
  socket.on('editName', (newName) => {
    updateName(newName, socket);
  })

  //começar um novo jogo
  socket.on('startNewGame', (oponent) => {
    startNewGame(oponent, socket);
  });

  //recebe a celula que o usuário jogou
  socket.on('userPlayed', (cel) => {
    socketPlayed(cel, socket);
  })

  socket.on('disconnect', function userDisconnected() {

    console.log('Usuário disconectado')

    var oponentId = null;

    for (var i = 0; i < usuarios.length; i++) {

      if (usuarios[i].tictac.id == socket.tictac.id) {
        //verificar se está em jogo
        //se sim, parar o jogo, comunicar o oponente e tornar o mesmo disponível
        if (socket.tictac.status != 'disponivel') {

          for (var j = 0; j < jogos.length; j++) {

            if (jogos[j].player1.id == socket.tictac.id || jogos[j].player2.id == socket.tictac.id)

              if (jogos[j].player1.id == socket.tictac.id) {
                findSocketByUserId(jogos[j].player2.id).emit('gameFailed', socket.tictac);
                oponentId = jogos[j].player2.id;
              } else {
                findSocketByUserId(jogos[j].player1.id).emit('gameFailed', socket.tictac);
                oponentId = jogos[j].player1.id;
              }
            //remove o jogo da memória
            jogos.splice(j, 1);

          }

        }
        //procura o oponente e seta como disponível
        for (var j = 0; j < usuarios.length; j++) {
          if (usuarios[j].tictac.id == oponentId) {
            usuarios[j].tictac.status = 'disponivel';
            usuarios[j].tictac.oponent = null;
            usuarios[j].tictac.symbol = null;
          }
        }

        usuarios.splice(i, 1);
        updateUserList(socket);
        break;

      }

    }

    updateUserList(socket);

  });
});

/* Funções da aplicação */

//novo usuário conectado
//recebe o socket de quem conectou
function userConnected(socket) {
  console.log('userConnected: um novo usuário conectado');

  socket.tictac = {
    id: uniqid(),
    name: 'visitante',
    status: 'disponivel',
    oponent: null,
    symbol: null
  };

  usuarios.push(socket);
  /*console.log('---usuarios---');
  console.log(socket.tictac);
  console.log('---usuarios---');*/

  updateMyData(socket);
  updateUserList(socket);

}

//atualiza os dados do proprio socket
function updateMyData(socket) {
  socket.emit('updateMyData', socket.tictac);
}

//atualiza a lista de usuários
function updateUserList(socket) {
  //métos do ES6 do js

  let listaUsuarios = usuarios.map((usuario) => {
    return usuario.tictac;
  }).filter((usuario) => {
    return usuario.status == 'disponivel';
  });

  //manda a lista de todos os usuários disponíveis para todo mundo que está conectado no socket
  io.emit('updateUserList', listaUsuarios);

}

//atualiza o nome
function updateName(newName, socket) {
  console.log('Edição do nome');

  socket.tictac.name = newName;
  updateMyData(socket);
  updateUserList(socket);

}

//inicia um novo jogo
function startNewGame(oponent, socket) {

  if (oponent.status != 'disponivel') {
    socket.emit('gameFailed', oponent);
  } else {

    var socketOponent = findSocketByUserId(oponent.id);

    if (!socketOponent) return false;

    socket.tictac.oponent = oponent.id;
    socketOponent.tictac.oponent = socket.tictac.id;

    socket.status = 'game';
    socketOponent.tictac.status = 'game';

    socket.tictac.symbol = 'O';
    socketOponent.tictac.symbol = 'X';

    updateUserList(socket);

    var thisGame = {
      player1: {
        id: socket.tictac.id,
        selectedCel: []
      },
      player2: {
        id: socketOponent.tictac.id,
        selectedCel: []
      },
      key: `${socket.tictac.id}-${socketOponent.id}`,
      play: (Math.random() * (1 - 0) + 0) ? socketOponent : socket

    };

    jogos.push(thisGame);

    socket.emit('gameStarted', { oponent, symbol: socket.tictac.symbol });
    socketOponent.emit('gameStarted', { oponent: socket.tictac, symbol: socketOponent.tictac.symbol });

    setTimeout((thisGame) => {
      thisGame.play.emit('play', null);
    }, 200, thisGame)

  }

}

//procura o socket pelo id
function findSocketByUserId(id) {
  for (var i = 0; i < usuarios.length; i++) {
    if (usuarios[i].tictac.id == id) return usuarios[i];

  }

  return false;
}

//socket jogou
function socketPlayed(cel, socket) {
  //procura o jogo

  var gameData = null;
  var oponent = null;
  var socketOponent = null;
  var games = null;
  var gameResult = null;
  var gameKey = null;

  //pega o jogo
  for (var i = 0; i < jogos.length; i++) {

    if (jogos[i].player1.id == socket.tictac.id || jogos[i].player2.id == socket.tictac.id) {
      gameKey = i;
      gameData = jogos[i];
    }
  }

  oponent = (gameData.player1.id == socket.tictac.id) ? { id: gameData.player2.id, player: '2' } : { id: gameData.player1.id, player: '1' }

  //procura o socket do oponente
  socketOponent = findSocketByUserId(oponent.id);

  //armazena o valor jogado de acordo com o player
  console.log("oponent.player: "+oponent.player)
  if (oponent.player == "1") {
    gameData.player1.selectedCel.push(cel);
    games = gameData.player1.selectedCel;
  } else {
    gameData.player2.selectedCel.push(cel);
    games = gameData.player2.selectedCel;
  }

  status = false;

  //verifica se ganhou, empatou ou ainda tem jogada
  if (games.length >= 3) {
    for (var i = 0; i < win.length; i++) {
      //usando lodash
      if (_.difference(win[i], games.sort()).length === 0) {
        status = true;
        break;
      }
    }
  }

  if (status == true) {
    console.log('ganhou');
    gameResult = 'ganhou';

    socket.emit('youWin');
    socketOponent.emit('youLose');
  } else if (gameData.player1.selectedCel.length + gameData.player2.selectedCel.length >= 9) {

    console.log('empatou');
    gameResult = 'empatou';

    socket.emit('gameTide');
    socketOponent.emit('gameTide');


  } else {
    console.log('proxima jogada')
    gameResult = 'proximo';
  }

  if (gameResult == 'empatou' || gameResult == 'ganhou') {
    //encerrar o jogo
    jogos.slice(gameKey, 1);

    socket.tictac.status = 'disponivel';
    socket.tictac.oponent = null;
    socket.tictac.symbol = null;

    socketOponent.tictac.status = 'disponivel';
    socketOponent.tictac.oponent = null;
    socketOponent.tictac.symbol = null;

    updateUserList(socket);


  }
console.log("socket.tictac.symbol: "+socket.tictac.symbol)
  socketOponent.emit('play', { cel, gameResult, symbol: socket.tictac.symbol })

}