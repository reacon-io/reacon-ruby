package main

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func must(err error) {
	if err != nil {
		panic(err)
	}
}
func write(path string, data []byte) {
	must(os.MkdirAll(filepath.Dir(path), 0755))
	must(os.WriteFile(path, data, 0600))
}
func command(directory string, args ...string) {
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = directory
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	must(cmd.Run())
}
func main() {
	const module = "github.com/reacon-io/reacon-go"
	version := "v" + os.Getenv("REACON_SDK_PACKAGE_VERSION")
	const root = "/cache/recording-package-go"
	source := os.Getenv("SDK_DIRECTORY")
	must(os.Setenv("GOMODCACHE", root+"/modules"))
	must(os.Setenv("GOWORK", "off"))
	command(source, "go", "clean", "-modcache")
	must(os.RemoveAll(root))
	must(os.MkdirAll(root, 0755))
	prefix := root + "/proxy/" + module + "/@v/"
	mod, err := os.ReadFile(source + "/go.mod")
	must(err)
	write(prefix+version+".mod", mod)
	info, err := json.Marshal(map[string]string{"Version": version, "Time": "2026-09-27T00:00:00Z"})
	must(err)
	write(prefix+version+".info", info)
	write(prefix+"list", []byte(version+"\n"))
	output, err := os.Create(prefix + version + ".zip")
	must(err)
	archive := zip.NewWriter(output)
	operations := map[string][]string{}
	must(filepath.WalkDir(source, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		if !entry.Type().IsRegular() {
			return fmt.Errorf("Nonregular package file: %s", path)
		}
		rel, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		file, err := archive.Create(module + "@" + version + "/" + filepath.ToSlash(rel))
		if err != nil {
			return err
		}
		if _, err = file.Write(data); err != nil {
			return err
		}
		if strings.HasPrefix(rel, "api_") && strings.HasSuffix(rel, ".go") {
			parsed, err := parser.ParseFile(token.NewFileSet(), path, data, 0)
			if err != nil {
				return err
			}
			for _, declaration := range parsed.Decls {
				function, ok := declaration.(*ast.FuncDecl)
				if !ok || function.Recv == nil || function.Type.Results == nil || len(function.Type.Results.List) != 1 {
					continue
				}
				result, ok := function.Type.Results.List[0].Type.(*ast.Ident)
				if !ok || !strings.HasPrefix(result.Name, "Api") || !strings.HasSuffix(result.Name, "Request") {
					continue
				}
				if function.Type.Params.NumFields() == 0 {
					continue
				}
				first := function.Type.Params.List[0]
				if len(first.Names) != 1 || first.Names[0].Name != "ctx" {
					continue
				}
				arguments := []string{}
				for _, field := range function.Type.Params.List[1:] {
					for _, name := range field.Names {
						arguments = append(arguments, name.Name)
					}
				}
				if _, exists := operations[function.Name.Name]; exists {
					return fmt.Errorf("Duplicate operation: %s", function.Name.Name)
				}
				operations[function.Name.Name] = arguments
			}
		}
		return nil
	}))
	must(archive.Close())
	must(output.Close())
	for _, suffix := range []string{".zip", ".mod", ".info"} {
		bytes, err := os.ReadFile(prefix + version + suffix)
		must(err)
		write("/results/artifacts/"+version+suffix, bytes)
	}
	consumer := root + "/consumer"
	write(consumer+"/go.mod", []byte("module reacon-recording-consumer\n\ngo 1.23\n\nrequire "+module+" "+version+"\n"))
	data, err := os.ReadFile("/suite/go.go")
	must(err)
	write(consumer+"/main.go", data)
	data, err = json.Marshal(operations)
	must(err)
	write(consumer+"/operations.json", data)
	must(os.Setenv("GOMODCACHE", root+"/modules"))
	must(os.Setenv("GOPROXY", "file://"+root+"/proxy,https://proxy.golang.org"))
	must(os.Setenv("GONOSUMDB", module))
	must(os.Setenv("GOWORK", "off"))
	command(consumer, "go", "mod", "download", module+"@"+version)
	installed := root + "/modules/" + module + "@" + version
	listing := exec.Command("go", "list", "-m", "-json", module)
	listing.Dir = consumer
	data, err = listing.Output()
	must(err)
	var resolved struct {
		Dir     string
		Version string
		Replace any
	}
	must(json.Unmarshal(data, &resolved))
	if resolved.Dir != installed || resolved.Version != version || resolved.Replace != nil {
		panic("Consumer does not resolve the installed module archive")
	}
	license, err := os.ReadFile(installed + "/LICENSE")
	must(err)
	if !strings.Contains(string(license), "Apache License") {
		panic("Missing Apache license")
	}
	command(consumer, "go", "run", "-mod=mod", ".")
}
