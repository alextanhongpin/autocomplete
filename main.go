package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sort"
	"strings"
	"syscall"
	"time"

	"github.com/alextanhongpin/stringdist"
	"github.com/alextanhongpin/typeahead"
	"github.com/julienschmidt/httprouter"
)

const DistanceThreshold = 2

type Word struct {
	Text  string  `json:"text"`
	Score float64 `json:"score"`
}
type AutocompleteResponse struct {
	Data []Word `json:"data"`
}
type Searcher struct {
	completer *typeahead.TrieNode
	correcter *stringdist.BKTree
}

func main() {
	searcher := makeAutocompleter()

	// wordLen := 32
	// damerauLevenshtein := stringdist.NewDamerauLevenshtein(wordLen)
	t := template.Must(template.ParseFiles("templates/index.html"))

	router := httprouter.New()
	router.GET("/", func(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
		t.Execute(w, nil)
	})

	router.GET("/v1/autocomplete", func(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
		q := r.URL.Query().Get("query")
		words := searcher.completer.Search(q)
		if len(words) == 0 {
			words = searcher.correcter.Search(q, DistanceThreshold)
		}
		result := make([]Word, len(words))
		for i, word := range words {
			// editDist := damerauLevenshtein.Calculate(word, q)
			// editDistScore := 1 - float64(editDist)/float64(max(len(word), len(q)))
			// fmt.Println(word, stringdist.JaroWinkler(word, q), editDistScore)
			result[i] = Word{
				Text:  word,
				Score: stringdist.JaroWinkler(word, q),
			}
		}
		sort.Slice(result, func(i, j int) bool {
			return result[i].Score > result[j].Score
		})
		n := len(result)
		if n > 10 {
			n = 10
		}
		json.NewEncoder(w).Encode(AutocompleteResponse{Data: result[:n]})
	})

	// This will only serve static files. The template will still need to
	// be rendered somewhere else.
	router.ServeFiles("/public/*filepath", http.Dir("public"))

	addr := ":8080"
	srv := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  10 * time.Minute,
		WriteTimeout: 10 * time.Minute,
	}
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGHUP, syscall.SIGINT, syscall.SIGTERM, syscall.SIGQUIT)
	go func() {
		log.Println("listening to port *:8080. press ctrl + c to cancel.")
		if err := srv.ListenAndServe(); err != nil {
			log.Fatal(err)
		}
	}()
	<-sig
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal(err)
	}
	log.Println("gracefull shutdown")
}

func makeAutocompleter() *Searcher {
	root := typeahead.NewTrieNode("^")

	wordLen := 32
	damerauLevenshtein := stringdist.NewDamerauLevenshtein(wordLen)
	// Initialize BK-Tree.
	bkTree := stringdist.NewBKTree(damerauLevenshtein)

	f, err := os.Open("/usr/share/dict/words")
	if err != nil {
		log.Fatal(err)
	}
	defer f.Close()
	var count int
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		str := strings.ToLower(scanner.Text())
		root.Add(str)
		bkTree.Add(str)
		count++
	}
	if err := scanner.Err(); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("inserted %d words\n", count)
	return &Searcher{
		completer: root,
		correcter: bkTree,
	}
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
