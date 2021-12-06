const express = require("express");
const app = express();
const cors = require("cors");
const pool = require("./db");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const enviarEmail = require("./email");
const { v4: uuidv4 } = require('uuid');

//middleware
app.use(cors());
app.use(express.json());


const getUniqueUsertoken = async() => {

    var usertoken;
    var unique = false;

    while(unique === false){
        try {
            usertoken =  uuidv4();

            const testarAlunosPendentes = await pool.query(
                "SELECT * FROM alunos_pendentes WHERE usertoken = $1",
                [usertoken]
                );

            const testarAlunos = await pool.query(
                "SELECT * FROM alunos WHERE usertoken = $1",
                [usertoken]
                );

            const testarAdmins = await pool.query(
                "SELECT * FROM admins WHERE usertoken = $1",
                [usertoken]
                );

            const testarAvaliadores = await pool.query(
                "SELECT * FROM avaliadores WHERE usertoken = $1",
                [usertoken]
                );

            if(testarAlunosPendentes.rowCount > 0 || testarAlunos.rowCount > 0 || testarAvaliadores.rowCount > 0 || testarAdmins.rowCount > 0){
                unique = false;
            }
            else{
                unique = true
                break;
            }
        } catch (err) {
            console.log(err);
            return;
        }
    }

    return usertoken;
}

app.get("/", async (req, res) => {
    const test = await pool.query("SELECT * FROM admins");
    if (test.rowCount > 0) {
        res.json("Servidor CHRONOS ativado!");
        return;
    }
    res.json("Banco de Dados Inoperante!")
    return;
});


//************************************ALUNOS PENDENTES***************************************************
//Criar um aluno pendente
app.post("/alunosPendentes", async (req, res) => {
    try {
        const newAluno = req.body;

        //validar criação
        const testarEmailAlunosPendentes = await pool.query(
            "SELECT * FROM alunos_pendentes WHERE email = $1", [newAluno.email]
            );

        const testarEmailAlunos = await pool.query(
            "SELECT * FROM alunos WHERE email = $1", [newAluno.email]
            );

        if (testarEmailAlunos.rowCount >= 1 || testarEmailAlunosPendentes.rowCount >= 1) {
            res.json("Email já está em uso");
            return;
        }

        
        newAluno.usertoken = await getUniqueUsertoken();
        //console.log(newAluno.usertoken);

        const newAlunoPendente = await pool.query(
            "INSERT INTO alunos_pendentes (nome,email,senha,matricula,curso,usertoken) VALUES($1,$2,$3,$4,$5,$6)",
            [newAluno.nome, newAluno.email,
            newAluno.senha, newAluno.matricula,
            newAluno.curso, newAluno.usertoken]
            ); 

        res.json("Cadastro solicitado ao Administrador!");
        return;

    } catch (err) {
        console.log(err);
        res.json("Um erro ocorreu!");
        return;
    }
});

//Buscar aluno especifico na tabela alunos pendentes
app.post("/alunos/verifyP", async (req, res) => {
    try {
        const myJSON = req.body;

        const users = await pool.query("SELECT * FROM alunos_pendentes WHERE email = $1 and senha = $2", [
            myJSON.email, myJSON.senha
            ]);

        if (users.rowCount < 1) {
            res.json([]);
            return;
        }
        else {
            res.json(users.rows[0]);
            return;
        }

    } catch (err) {
        console.log(err);
        res.json([]);
        return;
    }
});

//************************************ALUNOS*********************************************************
//verificar se existe um aluno especifico na tabela alunos
app.post("/alunos/verify", async (req, res) => {
    try {
        const myJSON = req.body;

        const users = await pool.query("SELECT * FROM alunos WHERE email = $1 and senha = $2", [
            myJSON.email, myJSON.senha
            ]);

        if (users.rowCount < 1) {
            res.json([]);
            return;
        }
        else {
            res.json(users.rows[0]);
            return;
        }

    } catch (err) {
        console.log(err);
        res.json([]);
        return;
    }
});

app.post("/updateAluno/:token", async (req, res) => {
    try {
        const { token } = req.params;
        const myJSON = req.body;

        if(myJSON.emailNovo.length > 0 && myJSON.senhaNova.length > 0){

            const users = await pool.query("UPDATE alunos SET email = $1 , senha = $2 WHERE usertoken = $3", [
                myJSON.emailNovo, myJSON.senhaNova, token
                ]);
        }

        else if(myJSON.emailNovo.length > 0){

            const users = await pool.query("UPDATE alunos SET email = $1 WHERE usertoken = $2", [
                myJSON.emailNovo, token
                ]);
        }

        else if(myJSON.senhaNova.length > 0){

            const users = await pool.query("UPDATE alunos SET senha = $1 WHERE usertoken = $2", [
                myJSON.senhaNova, token
                ]);
        }



        res.json("");
        return;
        

    } catch (err) {
        console.log(err);
        res.json("");
        return;
    }
});

app.get("/alunos/bytoken/:token", async (req, res) => {
    try {
        const { token } = req.params;

        const busca = await pool.query("SELECT * FROM alunos WHERE usertoken = $1", [
            token
            ]);

        if (busca.rowCount < 1) {
            res.json([]);
            return;
        }
        else {
            res.json(busca.rows[0]);
            return;
        }

    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
        return;
    }
});

//criar uma solicitação
app.get("/solicitacao/:token", async (req, res) => {
    try {

        const { token } = req.params;

        const isAluno = await pool.query(
            "SELECT * FROM alunos WHERE usertoken = $1",
            [token]
            );

        if (isAluno.rowCount < 1) {
            res.json("Operação Inválida: Sem permissão de aluno");
            return;
        }

        const temSolicitacao = await pool.query(
            "SELECT * FROM avaliacoes WHERE token_aluno = $1",
            [token]
            );

        for(var a = 0; a < temSolicitacao.rowCount; a++){
            if(temSolicitacao.rows[a].status === "Pendente"){
                res.json("Aguarde o resultado da ultima solicitação antes de uma requisitar uma nova");
                return;
            }
        }


        //escolher o avaliador que receberá a submissão
        const findAvaliadores = await pool.query("SELECT * FROM avaliadores ORDER BY id");

        if (findAvaliadores.rowCount < 1) {
            res.json("Não há avaliadores disponiveis, tente mais tarde!");
            return;
        }

        var avaliadorEscolhido = [];
        const getAvaliadorEscolhidoNumber = await pool.query("SELECT * FROM avaliador_selecionado");

        //Se nunca foi selecionado alguem, o proximo avaliador será o primeiro da lista
        if (getAvaliadorEscolhidoNumber.rowCount < 1) {
            avaliadorEscolhido = findAvaliadores.rows[0];
            const setAvaliador = await pool.query("INSERT INTO avaliador_selecionado (id_avaliador_escolhido) values ($1)", [
                findAvaliadores.rows[0].id
                ]);
        }
        else {
            for (var i = 0; i < findAvaliadores.rowCount; i++) {
                //se já foi selecionado alguém antes, então o proximo da lista é o selecionado

                //lista de avaliadores foi toda usada... volte pro avaliador do inicio
                if (findAvaliadores.rows[findAvaliadores.rowCount - 1].id === getAvaliadorEscolhidoNumber.rows[0].id_avaliador_escolhido) {
                    const setAvalidor = await pool.query("UPDATE avaliador_selecionado SET id_avaliador_escolhido = $1 WHERE id = '1'", [
                        findAvaliadores.rows[0].id
                        ]);
                    avaliadorEscolhido = findAvaliadores.rows[0];
                    break;
                }

                //Se ainda há avaliadores não-selecionados.. busque...
                if (findAvaliadores.rows[i].id > getAvaliadorEscolhidoNumber.rows[0].id_avaliador_escolhido) {
                    const setAvalidor = await pool.query("UPDATE avaliador_selecionado SET id_avaliador_escolhido = $1 WHERE id = '1'", [
                        findAvaliadores.rows[i].id
                        ]);
                    avaliadorEscolhido = findAvaliadores.rows[i];
                    break;
                    //logica de clonar as atividades
                }
            }
        }


        const versao = await pool.query("SELECT * FROM versoes WHERE id = (select max(id) from versoes)");

        //criar avaliação
        const insertAvaliacao = await pool.query(
            "INSERT INTO avaliacoes(token_aluno,token_avaliador,status,id_versao) VALUES ($1,$2,$3,$4)",
            [token, avaliadorEscolhido.usertoken, "Pendente", versao.rows[0].id]
            );

        //pegar o id da avaliacao
        const getAvaliacao = await pool.query(
            "SELECT * FROM avaliacoes WHERE token_aluno = $1 and token_avaliador = $2 ORDER BY id",
            [token, avaliadorEscolhido.usertoken]
            );

        const avaliacaoID = getAvaliacao.rows[getAvaliacao.rowCount - 1].id;

        //passar atividade do aluno para lista de atividades da avaliacao
        const getAtividades = await pool.query("SELECT * FROM atividades WHERE usertoken = $1", [
            token
            ]);


        var setAtividades = [];
        for (var j = 0; j < getAtividades.rowCount; j++) {
            setAtividades = await pool.query("INSERT INTO atividades_submetidas(id_avaliacao,titulo, data_inicio, data_fim, categoria, sub_categoria, descricao, quantidade_horas, usertoken, doc_link, nome_pdf, horas_validas) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)", [
                avaliacaoID, getAtividades.rows[j].titulo, getAtividades.rows[j].data_inicio, getAtividades.rows[j].data_fim, getAtividades.rows[j].categoria, getAtividades.rows[j].sub_categoria, getAtividades.rows[j].descricao, getAtividades.rows[j].quantidade_horas, getAtividades.rows[j].usertoken, getAtividades.rows[j].doc_link, getAtividades.rows[j].nome_pdf, "0"
                ])
        }

        res.json("Solicitação Cadastrada");
        return;

    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
        return;
    }
});


//ver status de solicitacoes



//************************************ATIVIDADES DOS ALUNOS***************************************************
//cadastrar atividade de aluno com pdf

app.post("/atividades", async (req, res) => {
    try {
        const myJSON = req.body;

        const row = await pool.query("INSERT INTO atividades(titulo, data_inicio, data_fim, categoria, sub_categoria, descricao, quantidade_horas, usertoken, doc_link, nome_pdf) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [
            myJSON.titulo, myJSON.dataInicio, myJSON.dataFim, myJSON.selectedCategoria, myJSON.selectedSubCategoria, myJSON.descricao, myJSON.quantHoras, myJSON.token, myJSON.link, myJSON.nomePdf
            ]);

        res.json("Atividade Cadastrada");
        return;

    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
        return;
    }
});

//Retornar todas as atividades de um aluno

app.get("/atividades/:token", async (req, res) => {
    try {
        const { token } = req.params;

        const busca = await pool.query("SELECT * FROM atividades WHERE usertoken = $1", [
            token
            ]);

        if (busca.rowCount < 1) {
            res.json([]);
            return;
        }
        else {
            res.json(busca.rows);
            return;
        }

    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
        return;
    }
});


//cadastrar pdf de uma atividade

app.post("/atividades/pdf/:nome", async (req, res) => {
    try {
        const { nome } = req.params;
        const file = fs.createWriteStream("uploads/" + nome);
        req.on("data", chunk => {
            file.write(chunk);
        })
        req.on("end", () => {
            file.end();
            res.json("PDF Cadastrado");
            return;
        })

    } catch (err) {
        console.log(err);
        res.json("");
        return;
    }
});

//enviar pdf para o client side
app.get('/download/:nome', async (req, res) => {
    try {
        const { nome } = req.params;
        var filePath = "/uploads/" + nome; //caminho do arquivo completo
        console.log("Gerando link de acesso ao arquivo: " + filePath);
        res.sendFile(__dirname + filePath);
        return;
    } catch (err) {
        console.log(err);
        return;
    }
});

//update atividade com pdf

app.put("/atividades/pdf/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const myJSON = req.body;

        //deletar pdf antigo
        //var filePath = __dirname + "\\uploads\\" + myJSON.nomeAntigoPdf;
        //fs.unlinkSync(filePath);

        const updateTitulo = await pool.query(
            "UPDATE atividades SET titulo = $1 WHERE id = $2",
            [myJSON.titulo, id]
            );

        const updateDataInicio = await pool.query(
            "UPDATE atividades SET data_inicio = $1 WHERE id = $2",
            [myJSON.dataInicio, id]
            );

        const updateDataFim = await pool.query(
            "UPDATE atividades SET data_fim = $1 WHERE id = $2",
            [myJSON.dataFim, id]
            );

        const updateDescricao = await pool.query(
            "UPDATE atividades SET descricao = $1 WHERE id = $2",
            [myJSON.descricao, id]
            );

        const updateQuantHoras = await pool.query(
            "UPDATE atividades SET quantidade_horas = $1 WHERE id = $2",
            [myJSON.quantHoras, id]
            );

        const updateDocLink = await pool.query(
            "UPDATE atividades SET doc_Link = $1 WHERE id = $2",
            [myJSON.docLink, id]
            );

        const updateCategoria = await pool.query(
            "UPDATE atividades SET categoria = $1 WHERE id = $2",
            [myJSON.selectedCategoria, id]
            );

        const updateSubCategoria = await pool.query(
            "UPDATE atividades SET sub_categoria = $1 WHERE id = $2",
            [myJSON.selectedSubCategoria, id]
            );

        const updateNomePdf = await pool.query(
            "UPDATE atividades SET nome_pdf = $1 WHERE id = $2",
            [myJSON.nomePdf, id]
            );

        res.json("Atividade Atualizada!");
        return;
    } catch (err) {
        console.log(err);
        res.json("Um erro ocorreu!");
        return;
    }
});

app.put("/atividades/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const myJSON = req.body;

        const updateTitulo = await pool.query(
            "UPDATE atividades SET titulo = $1 WHERE id = $2",
            [myJSON.titulo, id]
            );

        const updateDataInicio = await pool.query(
            "UPDATE atividades SET data_inicio = $1 WHERE id = $2",
            [myJSON.dataInicio, id]
            );

        const updateDataFim = await pool.query(
            "UPDATE atividades SET data_fim = $1 WHERE id = $2",
            [myJSON.dataFim, id]
            );

        const updateDescricao = await pool.query(
            "UPDATE atividades SET descricao = $1 WHERE id = $2",
            [myJSON.descricao, id]
            );

        const updateQuantHoras = await pool.query(
            "UPDATE atividades SET quantidade_horas = $1 WHERE id = $2",
            [myJSON.quantHoras, id]
            );

        const updateDocLink = await pool.query(
            "UPDATE atividades SET doc_Link = $1 WHERE id = $2",
            [myJSON.docLink, id]
            );

        const updateCategoria = await pool.query(
            "UPDATE atividades SET categoria = $1 WHERE id = $2",
            [myJSON.selectedCategoria, id]
            );

        const updateSubCategoria = await pool.query(
            "UPDATE atividades SET sub_categoria = $1 WHERE id = $2",
            [myJSON.selectedSubCategoria, id]
            );

        const updateNomePdf = await pool.query(
            "UPDATE atividades SET nome_pdf = $1 WHERE id = $2",
            [myJSON.nomePdf, id]
            );

        res.json("Atividade Atualizada!");
        return;
    } catch (err) {
        console.log(err);
        res.json("Um erro ocorreu!");
        return;
    }
});


//deletar uma atividade

app.delete("/atividades/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body;

        const deleteTodo = await pool.query("DELETE FROM atividades WHERE id = $1 AND usertoken = $2", [
            id, body.token
            ]);

        res.json("Atividade deletada");
        return;

    } catch (err) {
        console.log(err.message);
        res.json("Ocorreu um erro!");
        return;
    }
});

//getSolicitacoes Aluno

app.get("/alunoSolicitacoes/:token", async (req, res) => {
    try {

        const { token } = req.params;

        const isAluno = await pool.query(
            "SELECT * FROM alunos WHERE usertoken = $1",
            [token]
            );

        if (isAluno.rowCount < 1) {
            res.json([]);
            return;
        }

        const getSolicitacoes = await pool.query(
            "SELECT * FROM avaliacoes WHERE token_aluno = $1 ORDER BY id",
            [token]
            );

        if (getSolicitacoes.rowCount < 1) {
            res.json([]);
            return;
        }

        res.json(getSolicitacoes.rows);
        return;

    } catch (err) {
        console.log(err.message);
        res.json([]);
        return;
    }
});

//getAtividades de uma solicitacao avaliada
app.post("/atividadesAvaliadas", async (req, res) => {
    try {

        const body = req.body;

        const isAluno = await pool.query(
            "SELECT * FROM alunos WHERE usertoken = $1",
            [body.token]
            );

        if (isAluno.rowCount < 1) {
            res.json([]);
            return;
        }

        const validator = await pool.query(
            "SELECT * FROM avaliacoes WHERE token_aluno = $1 AND id = $2",
            [body.token, body.id]
            );

        if (validator.rowCount < 1) {
            res.json([]);
            return;
        }

        const getAtividades = await pool.query(
            "SELECT * FROM atividades_submetidas WHERE usertoken = $1 and id_avaliacao = $2 ORDER BY id",
            [body.token, validator.rows[0].id]
            );

        if (getAtividades.rowCount < 1) {
            res.json([]);
            return;
        }

        res.json(getAtividades.rows);
        return;

    } catch (err) {
        console.log(err.message);
        res.json([]);
        return;
    }
});

app.post("/atividadesAvaliadasAvaliador", async (req, res) => {
    try {

        const body = req.body; 

        const isAvaliador = await pool.query(
            "SELECT * FROM avaliadores WHERE usertoken = $1",
            [body.token]
            );

        if (isAvaliador.rowCount < 1) {
            res.json([]);
            return;
        }

        const validator = await pool.query(
            "SELECT * FROM avaliacoes WHERE token_avaliador = $1 AND id = $2",
            [body.token, body.id]
            );

        if (validator.rowCount < 1) {
            res.json([]);
            return;
        }

        const getAtividades = await pool.query(
            "SELECT * FROM atividades_submetidas WHERE id_avaliacao = $1 ORDER BY id",
            [validator.rows[0].id]
            );

        if (getAtividades.rowCount < 1) {
            res.json([]);
            return;
        }

        res.json(getAtividades.rows);
        return;

    } catch (err) {
        console.log(err.message);
        res.json([]);
        return;
    }
});

//************************************Avaliadores***************************************************
app.post("/getAvaliador", async (req, res) => {
    try {

        const body = req.body;  

        const isAvaliador = await pool.query(
            "SELECT * FROM avaliadores WHERE usertoken = $1",
            [body.token]
            );

        if (isAvaliador.rowCount < 1) {
            res.json([]);
            return;
        }

        res.json(isAvaliador.rows[0]);

    } catch (err) {
        console.log(err.message);
        res.json([]);
        return;
    }
});

app.post("/updateAvaliador/:token", async (req, res) => {
    try {
        const { token } = req.params;
        const myJSON = req.body;

        if(myJSON.emailNovo.length > 0 && myJSON.senhaNova.length > 0){

            const users = await pool.query("UPDATE avaliadores SET email = $1 , senha = $2 WHERE usertoken = $3", [
                myJSON.emailNovo, myJSON.senhaNova, token
                ]);
        }

        else if(myJSON.emailNovo.length > 0){

            const users = await pool.query("UPDATE avaliadores SET email = $1 WHERE usertoken = $2", [
                myJSON.emailNovo, token
                ]);
        }

        else if(myJSON.senhaNova.length > 0){

            const users = await pool.query("UPDATE avaliadores SET senha = $1 WHERE usertoken = $2", [
                myJSON.senhaNova, token
                ]);
        }



        res.json("");
        return;
        

    } catch (err) {
        console.log(err);
        res.json("");
        return;
    }
});

//getSolicitacoes
app.get("/avaliadorSolicitacoes/:token", async (req, res) => {
    try {
        const { token } = req.params;

        const isAvaliador = await pool.query(
            "SELECT * FROM avaliadores WHERE usertoken = $1",
            [token]
            );

        if (isAvaliador.rowCount < 1) {
            res.json([]);
            return;
        }

        const solicitacoes = await pool.query("SELECT * FROM avaliacoes WHERE token_avaliador = $1", [
            token
            ]);

        if (solicitacoes.rowCount < 1) {
            res.json([]);
            return;
        };

        var aluno;

        for (var i = 0; i < solicitacoes.rowCount; i++) {

            aluno = await pool.query("SELECT * FROM alunos WHERE usertoken = $1", [
                solicitacoes.rows[i].token_aluno
                ]);

            if (aluno.rowCount < 1) {
                solicitacoes.rows[i].token_aluno = "Nome indisponivel"
            }
            else {
                solicitacoes.rows[i].token_aluno = aluno.rows[0].nome;
            }
        }

        res.json(solicitacoes.rows);

    } catch (err) {
        console.log(err);
        res.json([]);
    }
});

//getAtividades de uma avaliação
app.post("/atividadesAvaliacao", async (req, res) => {
    try {
        const body = req.body;

        const isAvaliador = await pool.query(
            "SELECT * FROM avaliadores WHERE usertoken = $1",
            [body.token]
            );

        if (isAvaliador.rowCount < 1) {
            res.json([]);
            return;
        }

        //verificar se essa avaliacao pertence a quem está solicitando
        const validator = await pool.query("SELECT * FROM avaliacoes WHERE id = $1 AND token_avaliador = $2", [
            body.id, body.token
            ]);

        if (validator.rowCount < 1) {
            res.json([]);
            return;
        }

        const atividades = await pool.query("SELECT * FROM atividades_submetidas WHERE id_avaliacao = $1", [
            body.id
            ]);

        if (atividades.rowCount < 1) {
            res.json([]);
            return;
        }

        res.json(atividades.rows);

    } catch (err) {
        console.log(err);
        res.json([]);
    }
});

//enviarAvaliacao
app.put("/enviarAvaliacao", async (req, res) => {
    try {

        const body = req.body;

        const isAvaliador = await pool.query(
            "SELECT * FROM avaliadores WHERE usertoken = $1",
            [body.token]
            );

        if (isAvaliador.rowCount < 1) {
            res.json("Falha na permissão");
            return;
        }

        //verificar a qual avaliação a atividade pertence
        const validator = await pool.query("SELECT * FROM atividades_submetidas WHERE id = $1", [
            body.id
            ]);

        if (validator.rowCount < 1) {
            res.json("Atividade não existe");
            return;
        }

        //verificar se essa avaliacao pertence a quem está solicitando
        const validator1 = await pool.query("SELECT * FROM avaliacoes WHERE id = $1 AND token_avaliador = $2", [
            validator.rows[0].id_avaliacao, body.token
            ]);

        if (validator1.rowCount < 1) {
            res.json("Falha na permissão");
            return;
        }

        //update
        const update = await pool.query("UPDATE atividades_submetidas SET feedback = $1, horas_validas = $2 WHERE id = $3", [
            body.feedback, body.quantHoras, body.id
            ]);

        res.json("Feedback adicionado")
        return;

    } catch (err) {
        console.log(err.message);
        res.json("Ocorreu um erro!");
        return;
    }
});


app.post("/aprovarAtividades", async (req, res) => {
    try{

        const body = req.body;

        const isAvaliador = await pool.query(
            "SELECT * FROM avaliadores WHERE usertoken = $1",
            [body.token]
            );

        if (isAvaliador.rowCount < 1) {
            res.json("Falha na permissão");
            return;
        }

        const getAvaliacao = await pool.query("SELECT * FROM avaliacoes WHERE id = $1 AND token_avaliador = $2", [
            body.id_avaliacao, body.token
            ]);

        const getAluno = await pool.query("UPDATE alunos SET status_entrega = $1 WHERE usertoken = $2", [
            "Em Homologação", getAvaliacao.rows[0].token_aluno,
            ]);

        res.json("Atividades entregues!")
        return;

    }catch(err){
        console.log(err)
        res.json("")
        return;
    }
});

//marca Avaliacao como concluida
app.post("/finalizarAvaliacao", async (req, res) => {
    try {

        const body = req.body;

        const isAvaliador = await pool.query(
            "SELECT * FROM avaliadores WHERE usertoken = $1",
            [body.token]
            );

        if (isAvaliador.rowCount < 1) {
            res.json("Falha na permissão");
            return;
        }

        //verificar se essa avaliacao pertence a quem está solicitando
        const validator1 = await pool.query("SELECT * FROM avaliacoes WHERE id = $1 AND token_avaliador = $2", [
            body.id_avaliacao, body.token
            ]);

        console.log(body.id_avaliacao, body.token);

        if (validator1.rowCount < 1) {
            res.json("Falha na permissão");
            return;
        }

        //update
        const update = await pool.query("UPDATE avaliacoes SET status = $1 WHERE id = $2", [
            "Avaliado", body.id_avaliacao
            ]);

        res.json("Submissão Avaliada")
        return;

    } catch (err) {
        console.log(err.message);
        res.json("Ocorreu um erro!");
        return;
    }
});

//************************************Admins***************************************************
//retorna os detalhes sobre um aluno em homologação
app.post("/alunoDetalhes/:token", async (req, res) => {
    try {
        const { token } = req.params;
        const myJSON = req.body;

        const validarPermissao = await pool.query(
            "SELECT * FROM admins WHERE usertoken = $1",
            [token]
            );

        if (validarPermissao.rowCount < 1) {
            res.json("Operação Inválida: Sem permissão de administrador");
            return;
        }

        const getAluno = await pool.query(
            "SELECT * FROM alunos WHERE usertoken = $1",
            [myJSON.aluno_token]
            );

        if(getAluno.rowCount < 1){
            res.json("Aluno não encontrado");
            return;
        }

        const getAvaliacao = await pool.query(
            "SELECT * FROM avaliacoes WHERE token_aluno = $1 ORDER BY id",
            [myJSON.aluno_token]
            );

        const avaliacao = getAvaliacao.rows[getAvaliacao.rowCount - 1];

        const getAvaliador = await pool.query(
            "SELECT * FROM avaliadores WHERE usertoken = $1",
            [avaliacao.token_avaliador]
            );

        if(getAvaliador.rowCount < 1){
            res.json("Ocorreu um erro");
            return;
        }

        const getVersao = await pool.query(
            "SELECT * FROM versoes WHERE id = $1",
            [avaliacao.id_versao]
            );

        if(getVersao.rowCount < 1){
            res.json("Ocorreu um erro");
            return;
        }

        res.json("id da avaliação: " + avaliacao.id + "\n" + "Avaliador: " + getAvaliador.rows[0].nome + "\n" + "Versão: " + getVersao.rows[0].nome);
        return;


    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
    }
});


app.post("/homologarEntrega/:token", async (req, res) => {
    try {
        const { token } = req.params;
        const myJSON = req.body;

        const validarPermissao = await pool.query(
            "SELECT * FROM admins WHERE usertoken = $1",
            [token]
            );

        if (validarPermissao.rowCount < 1) {
            res.json("Operação Inválida: Sem permissão de administrador");
            return;
        }

        const getAluno = await pool.query(
            "SELECT * FROM alunos WHERE usertoken = $1",
            [myJSON.aluno_token]
            );

        if(getAluno.rowCount < 1){
            res.json("Aluno não encontrado");
            return;
        }

        const updateNewStatus = await pool.query(
            "UPDATE alunos SET status_entrega = $1 WHERE usertoken = $2",
            [myJSON.status, myJSON.aluno_token]
            );
        
        res.json("Status atualizado para: " + getAluno.rows[0].nome);
        return;


    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
    }
});

//retorna a versão atual das AC

app.get("/versao/:token", async (req, res) => {
    try {

        const { token } = req.params;

        const versao = await pool.query("SELECT * FROM versoes WHERE id = (select max(id) from versoes)");

        if (versao.rowCount < 1) {
            res.json([]);
            return;
        }

        else {
            const categorias = await pool.query("SELECT * FROM categorias WHERE id_versao = $1",[versao.rows[0].id]);
            const subcategorias = await pool.query("SELECT * FROM subcategorias WHERE id_versao = $1",[versao.rows[0].id]);
            console.log("versão: " + versao.rows[0].nome + " Categorias: " + categorias.rows.length + " subcategorias: " + subcategorias.rows.length)
            res.json([categorias.rows, subcategorias.rows, versao.rows[0]])
            return;
        }

    } catch (err) {
        console.log(err);
        res.json([]);
        return;
    }
});


//retorna a versão especifica das AC

app.get("/versao-solicitada/:id_avaliacao", async (req, res) => {
    try {

        const { id_avaliacao } = req.params;

        const avaliacoes = await pool.query("SELECT * FROM avaliacoes WHERE id = $1", [id_avaliacao])

        const versao = await pool.query("SELECT * FROM versoes WHERE id = $1",[avaliacoes.rows[0].id_versao]);

        if (versao.rowCount < 1) {
            res.json([]);
            return;
        }

        else {
            const categorias = await pool.query("SELECT * FROM categorias WHERE id_versao = $1",[versao.rows[0].id]);
            const subcategorias = await pool.query("SELECT * FROM subcategorias WHERE id_versao = $1",[versao.rows[0].id]);
            console.log("versão: " + versao.rows[0].nome + " Categorias: " + categorias.rows.length + " subcategorias: " + subcategorias.rows.length)
            res.json([categorias.rows, subcategorias.rows, versao.rows[0]])
            return;
        }

    } catch (err) {
        console.log(err);
        res.json([]);
        return;
    }
});

//retorna todos os alunos pendentes

app.get("/alunosPendentes/:token", async (req, res) => {
    try {

        const { token } = req.params;

        const validarPermissao = await pool.query("SELECT * FROM admins WHERE usertoken = $1", [
            token
            ]);

        if (validarPermissao.rowCount < 1) {
            res.json([]);
            return;
        }

        const allAlunos = await pool.query("SELECT * FROM alunos_pendentes");

        if (allAlunos.rowCount < 1) {
            res.json([]);
            return;
        }

        else {
            res.json(allAlunos.rows);
            return;
        }

    } catch (err) {
        console.log(err);
        res.json([]);
        return;
    }
});

//retorna todos os alunos aprovados

app.get("/alunos/:token", async (req, res) => {
    try {
        const { token } = req.params;

        const validarPermissao = await pool.query("SELECT * FROM admins WHERE usertoken = $1", [
            token
            ]);

        if (validarPermissao.rowCount < 1) {
            res.json([]);
            return;
        }

        const allAlunos = await pool.query("SELECT * FROM alunos");

        if (allAlunos.rowCount < 1) {
            res.json([]);
            return;
        }

        else {
            res.json(allAlunos.rows);
            return;
        }

    } catch (err) {
        console.log(err);
        res.json([]);
        return;
    }
});

//retorna todos os avaliadores

app.get("/avaliadores/:token", async (req, res) => {
    try {
        const { token } = req.params;

        const validarPermissao = await pool.query("SELECT * FROM admins WHERE usertoken = $1", [
            token
            ]);

        if (validarPermissao.rowCount < 1) {
            res.json([]);
            return;
        }

        const allAvaliadores = await pool.query("SELECT * FROM avaliadores");

        if (allAvaliadores.rowCount < 1) {
            res.json([]);
            return;
        }

        else {
            res.json(allAvaliadores.rows);
            return;
        }

    } catch (err) {
        console.log(err);
        res.json([]);
        return;
    }
});

//cria avaliador
app.post("/avaliadores/:token", async (req, res) => {
    try {
        const { token } = req.params;
        const myJSON = req.body;

        const validarPermissao = await pool.query(
            "SELECT * FROM admins WHERE usertoken = $1",
            [token]
            );

        if (validarPermissao.rowCount < 1) {
            res.json("Operação Inválida: Sem permissão de administrador");
            return;
        }

        const validarInsert = await pool.query(
            "SELECT * FROM avaliadores WHERE email = $1",
            [myJSON.email]
            );

        if (validarInsert.rowCount > 0) {
            res.json("Já existe avaliador com esse Email");
            return;
        }

        myJSON.usertoken = await getUniqueUsertoken();

        const insertAvaliador = await pool.query(
            "INSERT INTO avaliadores (nome, matricula, email, senha, usertoken) VALUES ($1,$2,$3,$4,$5)",
            [myJSON.nome, myJSON.matricula, myJSON.email, myJSON.senha, myJSON.usertoken]
            );

        res.json("Avaliador Cadastrado");
        return;

    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
    }
});

//transforma aluno pendente em aluno
app.post("/liberarAcessoAluno", async (req, res) => {
    try {
        const myJSON = req.body;
        const token = myJSON.token;
        const id = myJSON.id;

        const validarPermissao = await pool.query(
            "SELECT * FROM admins WHERE usertoken = $1",
            [token]
            );

        if (validarPermissao.rowCount < 1) {
            res.json("Operação Inválida: Sem permissão de administrador");
            return;
        }

        const buscaAlunoPendente = await pool.query(
            "SELECT * FROM alunos_pendentes WHERE id = $1",
            [id]
            );

        if (buscaAlunoPendente.rowCount > 0) {
            try {

                const newAluno = await pool.query(
                    "INSERT INTO alunos (nome,email,senha,matricula,curso,usertoken,data_criacao,status_entrega) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
                    [buscaAlunoPendente.rows[0].nome, buscaAlunoPendente.rows[0].email,
                    buscaAlunoPendente.rows[0].senha, buscaAlunoPendente.rows[0].matricula,
                    buscaAlunoPendente.rows[0].curso, buscaAlunoPendente.rows[0].usertoken,
                    buscaAlunoPendente.rows[0].data_criacao, "Não Entregue"]
                    );

                const deleteAlunoPendente = await pool.query("DELETE FROM alunos_pendentes WHERE id = $1", [
                    id
                    ]);

                res.json("Acesso liberado para aluno: " + buscaAlunoPendente.rows[0].nome);
                return;

            } catch (err) {
                console.log(err);
                res.json("Um problema ocorreu!");
                return;
            }
        }

        res.json("Um problema ocorreu");
        return;

    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
        return;
    }
});


//nega acesso ao aluno pendente // remove ele da tabela...
app.post("/negarAcessoAluno", async (req, res) => {
    try {
        const myJSON = req.body;
        const token = myJSON.token;
        const id = myJSON.id;

        const validarPermissao = await pool.query(
            "SELECT * FROM admins WHERE usertoken = $1",
            [token]
            );

        if (validarPermissao.rowCount < 1) {
            res.json("Operação Inválida: Sem permissão de administrador");
            return;
        }

        const alunoPendente = await pool.query("SELECT * FROM alunos_pendentes WHERE id = $1", [
            id
            ]);

        const deleteAlunoPendente = await pool.query("DELETE FROM alunos_pendentes WHERE id = $1", [
            id
            ]);

        res.json("Acesso negado para: " + alunoPendente.rows[0].nome);
        return;

    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
        return;
    }
});

//cadastrar versão de categorias
app.post("/adicionarVersao", async (req, res) => {
    try {
        const myJSON = req.body;
        const token = myJSON.token;
        const id = myJSON.id;

        const validarPermissao = await pool.query(
            "SELECT * FROM admins WHERE usertoken = $1",
            [token]
            );

        if (validarPermissao.rowCount < 1) {
            res.json("Operação Inválida: Sem permissão de administrador");
            return;
        }

        const inserirVersao = await pool.query("INSERT INTO versoes(nome,horas) VALUES ($1,$2) ", [
            myJSON.vNome, myJSON.vHoras
            ]);

        const getInserirVersao = await pool.query("SELECT * FROM versoes WHERE id = (select max(id) from versoes)");

        var inserirCategorias = [];
        for(var i = 0; i < myJSON.categorias.length; i++){
            inserirCategorias = await pool.query("INSERT INTO categorias(id_versao,id,nome,horas) values ($1,$2,$3,$4);", [
                getInserirVersao.rows[0].id, myJSON.categorias[i].id, myJSON.categorias[i].nome, myJSON.categorias[i].horas
                ]);
        }

        var inserirSubCategorias = [];
        for(var i = 0; i < myJSON.subCategorias.length; i++){
            inserirSubCategorias = await pool.query("INSERT INTO subcategorias(id_versao,id_categoria,id,nome) values ($1,$2,$3,$4);", [
                getInserirVersao.rows[0].id, myJSON.subCategorias[i].id_categoria,myJSON.subCategorias[i].id, myJSON.subCategorias[i].nome
                ]);
        }
        

        res.json("Versão cadastrada!");
        return;

    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
        return;
    }
});


//desativar aluno
app.put("/desativarAluno", async (req, res) => {
    try {
        const myJSON = req.body;
        const token = myJSON.token;
        const id = myJSON.id;

        const validarPermissao = await pool.query(
            "SELECT * FROM admins WHERE usertoken = $1",
            [token]
            );

        if (validarPermissao.rowCount < 1) {
            res.json("Operação Inválida: Sem permissão de administrador");
            return;
        }

        const aluno = await pool.query("SELECT * FROM alunos WHERE id = $1", [
            id
            ]);

        const update = await pool.query("UPDATE alunos SET ativo = $1 WHERE id = $2", [
            false, id
            ]);

        res.json("Acesso suspenso para: " + aluno.rows[0].nome);
        return;

    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
        return;
    }
});

//ativar aluno
app.put("/ativarAluno", async (req, res) => {
    try {
        const myJSON = req.body;
        const token = myJSON.token;
        const id = myJSON.id;

        const validarPermissao = await pool.query(
            "SELECT * FROM admins WHERE usertoken = $1",
            [token]
            );

        if (validarPermissao.rowCount < 1) {
            res.json("Operação Inválida: Sem permissão de administrador");
            return;
        }

        const aluno = await pool.query("SELECT * FROM alunos WHERE id = $1", [
            id
            ]);

        const update = await pool.query("UPDATE alunos SET ativo = $1 WHERE id = $2", [
            true, id
            ]);

        res.json("Acesso reativado para: " + aluno.rows[0].nome);
        return;

    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
        return;
    }
});



//desativar avaliador
app.put("/desativarAvaliador", async (req, res) => {
    try {
        const myJSON = req.body;
        const token = myJSON.token;
        const id = myJSON.id;

        const validarPermissao = await pool.query(
            "SELECT * FROM admins WHERE usertoken = $1",
            [token]
            );

        if (validarPermissao.rowCount < 1) {
            res.json("Operação Inválida: Sem permissão de administrador");
            return;
        }

        const avaliador = await pool.query("SELECT * FROM avaliadores WHERE id = $1", [
            id
            ]);

        const update = await pool.query("UPDATE avaliadores SET ativo = $1 WHERE id = $2", [
            false, id
            ]);

        res.json("Acesso suspenso para: " + avaliador.rows[0].nome);
        return;

    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
        return;
    }
});

//ativar avaliador
app.put("/ativarAvaliador", async (req, res) => {
    try {
        const myJSON = req.body;
        const token = myJSON.token;
        const id = myJSON.id;

        const validarPermissao = await pool.query(
            "SELECT * FROM admins WHERE usertoken = $1",
            [token]
            );

        if (validarPermissao.rowCount < 1) {
            res.json("Operação Inválida: Sem permissão de administrador");
            return;
        }

        const avaliador = await pool.query("SELECT * FROM avaliadores WHERE id = $1", [
            id
            ]);

        const update = await pool.query("UPDATE avaliadores SET ativo = $1 WHERE id = $2", [
            true, id
            ]);

        res.json("Acesso reativado para: " + avaliador.rows[0].nome);
        return;

    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
        return;
    }
});

//************************************CONTROLE DE ACESSO***************************************************
app.get("/verify/:token", async (req, res) => {
    try {
        const { token } = req.params;

        const isAvaliador = await pool.query(
            "SELECT * FROM avaliadores WHERE usertoken = $1",
            [token]
            );

        if (isAvaliador.rowCount > 0) {
            res.json("avaliador");
            return;
        }

        const isAdmin = await pool.query(
            "SELECT * FROM admins WHERE usertoken = $1",
            [token]
            );

        if (isAdmin.rowCount > 0) {
            res.json("admin");
            return;
        }

        const isAluno = await pool.query(
            "SELECT * FROM alunos WHERE usertoken = $1",
            [token]
            );

        if (isAluno.rowCount > 0) {
            res.json("aluno");
            return;
        }

        res.json("");

    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
    }
});

//verifica se admin existe
app.post("/admins/verify", async (req, res) => {
    try {
        const myJSON = req.body;

        const validarInsert = await pool.query(
            "SELECT * FROM admins WHERE email = $1 and senha = $2",
            [myJSON.email, myJSON.senha]
            );

        if (validarInsert.rowCount > 0) {
            res.json(validarInsert.rows[0]);
            return;
        }

        res.json([]);

    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
    }
});

//verifica se avaliador existe
app.post("/avaliadores-verify", async (req, res) => {
    try {
        const myJSON = req.body;

        const validarInsert = await pool.query(
            "SELECT * FROM avaliadores WHERE email = $1 and senha = $2",
            [myJSON.email, myJSON.senha]
            );

        if (validarInsert.rowCount > 0) {
            res.json(validarInsert.rows[0]);
            return;
        }

        res.json([]);

    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
    }
});


//verifica se admin existe
app.post("/recuperarSenha", async (req, res) => {
    try {
        const myJSON = req.body;

        const verificarAluno = await pool.query(
            "SELECT * FROM alunos WHERE email = $1",
            [myJSON.email]
            );

        const verificarAvaliador = await pool.query(
            "SELECT * FROM avaliadores WHERE email = $1",
            [myJSON.email]
            );

        if(verificarAluno.rowCount > 0){   
            var to = myJSON.email;
            var subject = 'Recuperação de Senha';
            var html = '<strong>Segue as orientações para recuperar a conta: </strong><p>1 - Use essa senha provisória <b>' + verificarAluno.rows[0].senha + '</b> para entrar no sistema</p><p>2 - Atualize a senha dentro do sistema</p><p>3 - Caso não tenha solicitado recuperação de senha, ignore este email</p>';

            enviarEmail(to,subject,html);
            res.json("Email Enviado");
            return;
        }
        else if(verificarAvaliador.rowCount > 0){   
            var to = myJSON.email;
            var subject = 'Recuperação de Senha';
            var html = '<strong>Segue as orientações para recuperar a conta: </strong><p>1 - Use essa senha provisória <b>' + verificarAvaliador.rows[0].senha + '</b> para entrar no sistema</p><p>2 - Atualize a senha dentro do sistema</p><p>3 - Caso não tenha solicitado recuperação de senha, ignore este email</p>';

            enviarEmail(to,subject,html);
            res.json("Email Enviado");
            return;
        }

        res.json("Usuário não encontrado");
        return;

    } catch (err) {
        console.log(err);
        res.json("Um problema ocorreu!");
    }
});


const port = process.env.PORT || 5000;

app.listen(port, () => {
    console.log("Servidor rodando na porta " + port);
});