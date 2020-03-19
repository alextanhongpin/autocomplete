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

const (
	Completer string = "completer"
	Corrector string = "corrector"
)
const DistanceThreshold = 2

type Word struct {
	Text  string  `json:"text"`
	Score float64 `json:"score"`
}

type Suggestion struct {
	Data []Word `json:"data"`
	Type string `json:"type"`
}

type Searcher struct {
	completer *typeahead.TrieNode
	correcter *stringdist.BKTree
}

func (s *Searcher) Corrector(query string) []string {
	return s.correcter.Search(query, DistanceThreshold)
}

func (s *Searcher) Completer(query string) []string {
	return s.completer.Search(query)
}

func (s *Searcher) safeLimit(limit int) int {
	if limit <= 0 {
		return 10
	}
	if limit > 100 {
		return 100
	}
	return limit
}

func (s *Searcher) Suggest(query string, limit int) Suggestion {
	var words []string
	var resultType string

	words = s.Completer(query)
	resultType = Completer
	if len(words) == 0 {
		words = s.Corrector(query)
		resultType = Corrector
	}

	result := make([]Word, len(words))
	for i, word := range words {
		// Aside from JaroWinkler, we can also use damerau
		// levenshtein distance to compute the edit distance
		// score.
		// editDist := damerauLevenshtein.Calculate(word, q)
		// editDistScore := 1 - float64(editDist)/float64(max(len(word), len(q)))
		// fmt.Println(word, stringdist.JaroWinkler(word, q), editDistScore)
		result[i] = Word{
			Text:  word,
			Score: stringdist.JaroWinkler(word, query),
		}
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].Score > result[j].Score
	})
	limit = s.safeLimit(limit)
	n := len(result)
	if n > limit {
		n = limit
	}
	return Suggestion{
		Data: result[:n],
		Type: resultType,
	}
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
		res := searcher.Suggest(q, 10)
		json.NewEncoder(w).Encode(res)
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
	termCh := make(chan os.Signal, 1)
	signal.Notify(termCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		log.Printf("listening to port *%s. press ctrl + c to cancel.\n", addr)
		if err := srv.ListenAndServe(); err != nil {
			log.Fatal(err)
		}
	}()
	<-termCh
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal(err)
	}
	log.Println("graceful shutdown")
}

func makeAutocompleter() *Searcher {
	// Initialize Trie.
	root := typeahead.NewTrieNode("^")

	// Initialize BK-Tree with damerau levenshtein distance.
	wordLen := 32
	damerauLevenshtein := stringdist.NewDamerauLevenshtein(wordLen)
	bkTree := stringdist.NewBKTree(damerauLevenshtein)

	// Load dictionary.
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
